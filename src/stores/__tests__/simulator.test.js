import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, it, expect } from 'vitest'
import { useSimulatorStore } from '../simulator.js'

// Convierte un VPN a dirección virtual hexadecimal (páginas de 4 KB)
const vpnToAddr = (vpn) => '0x' + (vpn * 0x1000).toString(16).toUpperCase().padStart(4, '0')

describe('simulatorStore — lógica de simulación de memoria', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useSimulatorStore()
  })

  // ─── 1. TLB HIT ──────────────────────────────────────────────────────────
  describe('TLB HIT', () => {
    it('la segunda vez que se accede a la misma dirección es TLB_HIT', () => {
      const pid = store.addProcess('P1', 2)

      store.executeInstruction(pid, vpnToAddr(0), 'R') // 1ra: PAGE_FAULT → carga en TLB
      store.executeInstruction(pid, vpnToAddr(0), 'R') // 2da: debe ser TLB_HIT

      const lastLog = store.executionLog.at(-1)
      expect(lastLog.result).toBe('TLB_HIT')
      expect(store.metrics.tlbHits).toBe(1)
    })
  })

  // ─── 2. TLB MISS → carga en TLB ──────────────────────────────────────────
  describe('TLB MISS', () => {
    it('cuando la página es válida pero no está en TLB, carga la traducción en TLB', () => {
      const pid = store.addProcess('P1', 2)

      // Primera instrucción: PAGE_FAULT → página llega a RAM y TLB
      store.executeInstruction(pid, vpnToAddr(0), 'R')

      // Vaciar TLB manualmente para forzar miss (la página sigue válida en pageTable)
      store.tlb = []

      store.executeInstruction(pid, vpnToAddr(0), 'R')

      const lastLog = store.executionLog.at(-1)
      expect(lastLog.result).toBe('TLB_MISS')
      // La traducción debe haberse recargado en el TLB
      expect(store.tlb).toHaveLength(1)
      expect(store.tlb[0].vpn).toBe(0)
      expect(store.tlb[0].processId).toBe(pid)
    })
  })

  // ─── 3. PAGE FAULT ───────────────────────────────────────────────────────
  describe('PAGE FAULT', () => {
    it('acceder a una página con valid=false dispara PAGE_FAULT y la carga en RAM', () => {
      const pid = store.addProcess('P1', 2)

      // La página empieza con valid=false → primera instrucción debe ser PAGE_FAULT
      store.executeInstruction(pid, vpnToAddr(0), 'R')

      expect(store.metrics.pageFaults).toBe(1)
      expect(store.executionLog.find(e => e.result === 'PAGE_FAULT')).toBeDefined()

      // Tras el fault, la página debe estar en RAM
      const process = store.processes.find(p => p.id === pid)
      expect(process.pageTable[0].valid).toBe(true)
      expect(process.pageTable[0].pfn).not.toBeNull()
    })
  })

  // ─── 4. Reemplazo FIFO ───────────────────────────────────────────────────
  describe('Reemplazo FIFO', () => {
    it('cuando la RAM está llena, reemplaza el marco más antiguo (menor loadedAt)', () => {
      store.updateConfig({ frameCount: 2, algorithm: 'FIFO' })
      const pid = store.addProcess('P1', 4)

      // Llenar los 2 marcos: vpn 0 (loadedAt=0) y vpn 1 (loadedAt=1)
      store.executeInstruction(pid, vpnToAddr(0), 'R')
      store.executeInstruction(pid, vpnToAddr(1), 'R')

      // vpn 2 → sin marcos libres → FIFO elige vpn 0 como víctima (loadedAt más bajo)
      store.executeInstruction(pid, vpnToAddr(2), 'R')

      const lastLog = store.executionLog.at(-1)
      expect(lastLog.result).toBe('PAGE_FAULT')
      expect(lastLog.victimVpn).toBe(0)
    })
  })

  // ─── 5. Reemplazo LRU ────────────────────────────────────────────────────
  describe('Reemplazo LRU', () => {
    it('cuando la RAM está llena, reemplaza el marco menos recientemente accedido', () => {
      store.updateConfig({ frameCount: 2, algorithm: 'LRU' })
      const pid = store.addProcess('P1', 4)

      // Cargar vpn 0 (tick=0) y vpn 1 (tick=1)
      store.executeInstruction(pid, vpnToAddr(0), 'R')
      store.executeInstruction(pid, vpnToAddr(1), 'R')

      // Re-acceder a vpn 0 (tick=2) → su lastAccessed sube a 2
      store.executeInstruction(pid, vpnToAddr(0), 'R')

      // vpn 2 → sin marcos libres → LRU elige vpn 1 (lastAccessed=1 < 2)
      store.executeInstruction(pid, vpnToAddr(2), 'R')

      const lastLog = store.executionLog.at(-1)
      expect(lastLog.result).toBe('PAGE_FAULT')
      expect(lastLog.victimVpn).toBe(1)
    })
  })

  // ─── 6. Violación de permisos ─────────────────────────────────────────────
  describe('PERMISSION_ERROR', () => {
    it('escribir en una página de solo lectura registra PERMISSION_ERROR y no cuenta el acceso', () => {
      // vpn 0 = solo lectura, vpn 1 = lectura/escritura
      const pid = store.addProcess('P1', 2, ['R', 'RW'])

      store.executeInstruction(pid, vpnToAddr(0), 'W')

      const lastLog = store.executionLog.at(-1)
      expect(lastLog.result).toBe('PERMISSION_ERROR')
      // Un acceso denegado no debe contarse en las métricas
      expect(store.metrics.totalAccesses).toBe(0)
      expect(store.metrics.pageFaults).toBe(0)
    })

    it('leer en una página de solo lectura está permitido', () => {
      const pid = store.addProcess('P1', 1, 'R')
      store.executeInstruction(pid, vpnToAddr(0), 'R')

      const lastLog = store.executionLog.at(-1)
      expect(lastLog.result).not.toBe('PERMISSION_ERROR')
    })
  })

  // ─── 7. Context switch → TLB flush ───────────────────────────────────────
  describe('CONTEXT_SWITCH', () => {
    it('cambiar de proceso vacía la TLB y registra CONTEXT_SWITCH en el log', () => {
      const pid1 = store.addProcess('P1', 2)
      const pid2 = store.addProcess('P2', 2)

      // P1 carga su página → queda una entrada en la TLB
      store.executeInstruction(pid1, vpnToAddr(0), 'R')
      expect(store.tlb.length).toBeGreaterThan(0)
      expect(store.tlb[0].processId).toBe(pid1)

      // Cambiar a P2 → context switch → TLB debe vaciarse antes del acceso de P2
      store.executeInstruction(pid2, vpnToAddr(0), 'R')

      // El switch a pid2 es el segundo entry (el primero fue null→pid1)
      const switchLog = store.executionLog.find(
        e => e.result === 'CONTEXT_SWITCH' && e.processId === pid2,
      )
      expect(switchLog).toBeDefined()

      // La TLB solo debe tener entradas de P2
      expect(store.tlb.every(e => e.processId === pid2)).toBe(true)
      expect(store.currentProcessId).toBe(pid2)
    })

    it('no genera CONTEXT_SWITCH adicional si se sigue usando el mismo proceso', () => {
      const pid = store.addProcess('P1', 2)

      // La primera instrucción siempre genera switch (null → pid)
      store.executeInstruction(pid, vpnToAddr(0), 'R')
      const switchesAfterFirst = store.executionLog.filter(e => e.result === 'CONTEXT_SWITCH').length
      expect(switchesAfterFirst).toBe(1)

      // Las siguientes instrucciones con el mismo pid NO deben generar más switches
      store.executeInstruction(pid, vpnToAddr(1), 'R')
      store.executeInstruction(pid, vpnToAddr(0), 'R')

      const switchesTotal = store.executionLog.filter(e => e.result === 'CONTEXT_SWITCH').length
      expect(switchesTotal).toBe(1)
    })
  })
})
