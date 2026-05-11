import { defineStore } from 'pinia'

function makePhysicalMemory(frameCount) {
  return Array.from({ length: frameCount }, (_, i) => ({
    frameId: i,
    processId: null,
    vpn: null,
    dirty: false,
    loadedAt: 0,
    lastAccessed: 0,
  }))
}

export const useSimulatorStore = defineStore('simulator', {
  state: () => ({
    config: {
      frameCount: 8,
      tlbSize: 4,
      algorithm: 'FIFO',
      pageFaultPenalty: 100,
      tlbMissPenalty: 10,
    },
    physicalMemory: makePhysicalMemory(8),
    processes: [],
    tlb: [],
    disk: [],
    currentProcessId: null,
    metrics: {
      tlbHits: 0,
      tlbMisses: 0,
      pageFaults: 0,
      totalAccesses: 0,
      hitRate: 0,
      swapOuts: 0,
      swapIns: 0,
    },
    executionLog: [],
    tick: 0,
    _nextProcessId: 1,
  }),

  getters: {
    simulationStarted: (state) => state.tick > 0,
    freeFrameCount: (state) => state.physicalMemory.filter(f => f.processId === null).length,
  },

  actions: {
    // ─── Helpers internos ──────────────────────────────────────────────────

    // Divide la dirección virtual en VPN (número de página) y offset.
    // Con páginas de 4 KB: los 12 bits bajos son el offset, el resto es el VPN.
    _parseAddress(virtualAddress) {
      const addr = parseInt(virtualAddress, 16)
      return { vpn: addr >>> 12, offset: addr & 0xFFF }
    },

    // Devuelve la entrada TLB para (processId, vpn) o null si no existe.
    _tlbLookup(processId, vpn) {
      return this.tlb.find(e => e.processId === processId && e.vpn === vpn) ?? null
    },

    // Inserta o actualiza una entrada en la TLB.
    // Si está llena, desaloja la entrada con menor lastAccessed (LRU del TLB).
    _tlbInsert(processId, vpn, pfn) {
      const existing = this._tlbLookup(processId, vpn)
      if (existing) {
        existing.pfn = pfn
        existing.lastAccessed = this.tick
        return
      }
      if (this.tlb.length >= this.config.tlbSize) {
        const lruIdx = this.tlb.reduce(
          (minIdx, e, i) => (e.lastAccessed < this.tlb[minIdx].lastAccessed ? i : minIdx),
          0,
        )
        this.tlb.splice(lruIdx, 1)
      }
      this.tlb.push({ vpn, pfn, processId, lastAccessed: this.tick })
    },

    // Elige el marco víctima para reemplazo según el algoritmo configurado.
    // FIFO: el que lleva más tiempo en memoria (menor loadedAt).
    // LRU:  el que no se usa hace más tiempo (menor lastAccessed).
    _selectVictim() {
      const occupied = this.physicalMemory.filter(f => f.processId !== null)
      return this.config.algorithm === 'FIFO'
        ? occupied.reduce((min, f) => (f.loadedAt < min.loadedAt ? f : min))
        : occupied.reduce((min, f) => (f.lastAccessed < min.lastAccessed ? f : min))
    },

    // Recalcula hitRate a partir de los contadores acumulados.
    _recalcHitRate() {
      this.metrics.hitRate = this.metrics.totalAccesses > 0
        ? (this.metrics.tlbHits / this.metrics.totalAccesses) * 100
        : 0
    },

    // ─── Acciones públicas ─────────────────────────────────────────────────

    executeInstruction(processId, virtualAddress, operation) {
      // ── Paso 1: context switch ─────────────────────────────────────────
      // Si cambia el proceso activo, se vacía la TLB completa porque las
      // traducciones de otro proceso no son válidas para el nuevo contexto.
      if (processId !== this.currentProcessId) {
        this.executionLog.push({
          tick: this.tick,
          processId,
          virtualAddress,
          operation,
          vpn: null,
          offset: null,
          result: 'CONTEXT_SWITCH',
          frameAssigned: null,
          victimVpn: null,
          detail: `Cambio de contexto: proceso ${this.currentProcessId ?? '–'} → proceso ${processId}. TLB vaciada.`,
        })
        this.tlb = []
        this.currentProcessId = processId
      }

      // ── Paso 2: parsear dirección virtual ─────────────────────────────
      const { vpn, offset } = this._parseAddress(virtualAddress)

      // ── Paso 3: verificar permisos ─────────────────────────────────────
      const process = this.processes.find(p => p.id === processId)
      if (!process) {
        this.executionLog.push({
          tick: this.tick, processId, virtualAddress, operation, vpn, offset,
          result: 'PERMISSION_ERROR', frameAssigned: null, victimVpn: null,
          detail: `Proceso ${processId} no encontrado.`,
        })
        this.tick++
        return
      }

      const pageEntry = process.pageTable.find(p => p.vpn === vpn)
      if (!pageEntry) {
        this.executionLog.push({
          tick: this.tick, processId, virtualAddress, operation, vpn, offset,
          result: 'PERMISSION_ERROR', frameAssigned: null, victimVpn: null,
          detail: `VPN ${vpn} no existe en la tabla de páginas del proceso ${processId}.`,
        })
        this.tick++
        return
      }

      if (operation === 'W' && pageEntry.permissions === 'R') {
        this.executionLog.push({
          tick: this.tick, processId, virtualAddress, operation, vpn, offset,
          result: 'PERMISSION_ERROR', frameAssigned: null, victimVpn: null,
          detail: `Acceso denegado: página VPN ${vpn} es de solo lectura (proceso ${processId}).`,
        })
        this.tick++
        return
      }

      this.metrics.totalAccesses++

      // ── Paso 4: buscar en TLB ──────────────────────────────────────────
      const tlbEntry = this._tlbLookup(processId, vpn)

      if (tlbEntry) {
        // TLB HIT — traducción encontrada en caché, no hay que ir a memoria.
        this.metrics.tlbHits++
        const pfn = tlbEntry.pfn
        tlbEntry.lastAccessed = this.tick

        // Paso 7: actualizar lastAccessed del marco físico
        const frame = this.physicalMemory[pfn]
        frame.lastAccessed = this.tick

        // Paso 8: marcar dirty si es escritura
        if (operation === 'W') {
          pageEntry.dirty = true
          frame.dirty = true
        }

        // Paso 9: registrar en log
        this.executionLog.push({
          tick: this.tick, processId, virtualAddress, operation, vpn, offset,
          result: 'TLB_HIT',
          frameAssigned: pfn,
          victimVpn: null,
          detail: `TLB HIT: VPN ${vpn} → marco físico ${pfn}. No se consultó la tabla de páginas.`,
        })
      } else {
        // TLB MISS — hay que consultar la tabla de páginas.
        this.metrics.tlbMisses++

        // ── Paso 5: buscar en tabla de páginas ─────────────────────────
        if (pageEntry.valid) {
          // La página está en RAM, solo faltaba en el TLB.
          const pfn = pageEntry.pfn
          this._tlbInsert(processId, vpn, pfn)

          // Paso 7
          const frame = this.physicalMemory[pfn]
          frame.lastAccessed = this.tick

          // Paso 8
          if (operation === 'W') {
            pageEntry.dirty = true
            frame.dirty = true
          }

          // Paso 9
          this.executionLog.push({
            tick: this.tick, processId, virtualAddress, operation, vpn, offset,
            result: 'TLB_MISS',
            frameAssigned: pfn,
            victimVpn: null,
            detail: `TLB MISS: VPN ${vpn} en tabla de páginas → marco ${pfn}. Traducción cargada en TLB.`,
          })
        } else {
          // ── Paso 6: PAGE FAULT — la página no está en RAM ─────────────
          this.metrics.pageFaults++

          // Verificar si la página faulteada ya estuvo en RAM y fue enviada al disco.
          const diskIdx = this.disk.findIndex(d => d.processId === processId && d.vpn === vpn)
          const isSwapIn = diskIdx !== -1

          let pfn
          let victimVpn = null

          const freeFrame = this.physicalMemory.find(f => f.processId === null)

          if (freeFrame) {
            // 6b. Hay un marco libre — usarlo directamente.
            pfn = freeFrame.frameId
            freeFrame.processId = processId
            freeFrame.vpn = vpn
            freeFrame.dirty = false
            freeFrame.loadedAt = this.tick
            freeFrame.lastAccessed = this.tick
          } else {
            // 6b. Sin marcos libres — elegir víctima según algoritmo.
            const victim = this._selectVictim()
            victimVpn = victim.vpn
            pfn = victim.frameId

            // Invalidar la víctima en la tabla de páginas de su proceso.
            const victimProcess = this.processes.find(p => p.id === victim.processId)
            if (victimProcess) {
              const victimPage = victimProcess.pageTable.find(p => p.vpn === victim.vpn)
              if (victimPage) {
                victimPage.valid = false
                victimPage.pfn = null
                victimPage.dirty = false
              }
            }

            // Enviar la víctima al disco (swap-out).
            const existingDiskIdx = this.disk.findIndex(
              d => d.processId === victim.processId && d.vpn === victim.vpn,
            )
            if (existingDiskIdx !== -1) this.disk.splice(existingDiskIdx, 1)
            this.disk.push({
              processId: victim.processId,
              vpn: victim.vpn,
              dirty: victim.dirty,
              evictedAt: this.tick,
            })
            this.metrics.swapOuts++

            // Eliminar cualquier entrada TLB de la víctima.
            this.tlb = this.tlb.filter(
              e => !(e.processId === victim.processId && e.vpn === victim.vpn),
            )

            // Reutilizar el marco físico.
            victim.processId = processId
            victim.vpn = vpn
            victim.dirty = false
            victim.loadedAt = this.tick
            victim.lastAccessed = this.tick
          }

          // 6c-6d. Actualizar la tabla de páginas del proceso actual.
          pageEntry.valid = true
          pageEntry.pfn = pfn
          pageEntry.dirty = false

          // Remover del disco si era un swap-in.
          if (isSwapIn) {
            this.disk.splice(diskIdx, 1)
            this.metrics.swapIns++
          }

          // 6e. Cargar la nueva traducción en la TLB.
          this._tlbInsert(processId, vpn, pfn)

          // Paso 8: dirty si es escritura
          if (operation === 'W') {
            pageEntry.dirty = true
            this.physicalMemory[pfn].dirty = true
          }

          // Paso 9
          this.executionLog.push({
            tick: this.tick, processId, virtualAddress, operation, vpn, offset,
            result: 'PAGE_FAULT',
            frameAssigned: pfn,
            victimVpn,
            swapIn: isSwapIn,
            detail: (() => {
              if (isSwapIn && victimVpn !== null)
                return `PAGE FAULT (swap-in): VPN ${vpn} recuperada del disco. Víctima VPN ${victimVpn} desalojada del marco ${pfn}.`
              if (isSwapIn)
                return `PAGE FAULT (swap-in): VPN ${vpn} recuperada del disco. Marco libre ${pfn} asignado.`
              if (victimVpn !== null)
                return `PAGE FAULT (carga inicial): VPN ${vpn} no estaba en RAM ni en disco. Víctima VPN ${victimVpn} desalojada del marco ${pfn}.`
              return `PAGE FAULT (carga inicial): VPN ${vpn} no estaba en RAM ni en disco. Marco libre ${pfn} asignado.`
            })(),
          })
        }
      }

      // ── Paso 10: incrementar tick ──────────────────────────────────────
      this.tick++

      // ── Paso 11: recalcular hit rate ───────────────────────────────────
      this._recalcHitRate()
    },

    resetSimulator() {
      this.physicalMemory = makePhysicalMemory(this.config.frameCount)
      this.processes = []
      this.tlb = []
      this.disk = []
      this.currentProcessId = null
      this.metrics = { tlbHits: 0, tlbMisses: 0, pageFaults: 0, totalAccesses: 0, hitRate: 0, swapOuts: 0, swapIns: 0 }
      this.executionLog = []
      this.tick = 0
      this._nextProcessId = 1
    },

    // Crea un proceso con una tabla de páginas vacía (todas las páginas en disco).
    // permissions puede ser 'R' o 'RW', o un array por página.
    addProcess(name, pageCount, permissions = 'RW') {
      const id = this._nextProcessId++
      const pageTable = Array.from({ length: pageCount }, (_, i) => ({
        vpn: i,
        pfn: null,
        valid: false,
        permissions: Array.isArray(permissions) ? (permissions[i] ?? 'RW') : permissions,
        dirty: false,
      }))
      this.processes.push({ id, name, pageTable })
      // Todas las páginas empiezan en disco — demand paging.
      pageTable.forEach(page => {
        this.disk.push({ processId: id, vpn: page.vpn, dirty: false, evictedAt: this.tick, initial: true })
      })
      return id
    },

    removeProcess(processId) {
      // Liberar los marcos físicos ocupados por el proceso.
      this.physicalMemory.forEach(frame => {
        if (frame.processId === processId) {
          frame.processId = null
          frame.vpn = null
          frame.dirty = false
        }
      })
      this.tlb = this.tlb.filter(e => e.processId !== processId)
      this.disk = this.disk.filter(d => d.processId !== processId)
      this.processes = this.processes.filter(p => p.id !== processId)
      if (this.currentProcessId === processId) this.currentProcessId = null
    },

    // Solo disponible antes de iniciar la simulación (tick === 0).
    // Si cambia frameCount, reinicializa la memoria física.
    updateConfig(newConfig) {
      if (this.tick > 0) return
      const prev = this.config.frameCount
      this.config = { ...this.config, ...newConfig }
      if (newConfig.frameCount !== undefined && newConfig.frameCount !== prev) {
        this.physicalMemory = makePhysicalMemory(this.config.frameCount)
      }
    },
  },
})
