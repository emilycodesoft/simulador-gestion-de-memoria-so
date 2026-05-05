<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSimulatorStore } from '../stores/simulator'

const store = useSimulatorStore()
const { tlb, processes, tick } = storeToRefs(store)

// La última entrada añadida es la que tiene mayor lastAccessed.
// En caso de empate (varias con el mismo tick), destacamos todas.
const latestTick = computed(() =>
  tlb.value.length > 0 ? Math.max(...tlb.value.map(e => e.lastAccessed)) : -1,
)

function processName(processId) {
  return processes.value.find(p => p.id === processId)?.name ?? `P${processId}`
}

function isLatest(entry) {
  return entry.lastAccessed === latestTick.value && tick.value > 0
}
</script>

<template>
  <div class="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
    <!-- Encabezado -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-white tracking-wide">TLB</span>
        <span class="text-xs text-gray-400 font-mono">Translation Lookaside Buffer</span>
      </div>
      <div class="flex items-center gap-2">
        <span
          class="text-xs font-mono px-2 py-0.5 rounded-full"
          :class="tlb.length > 0 ? 'bg-indigo-500/20 text-indigo-300' : 'bg-gray-700 text-gray-500'"
        >
          {{ tlb.length }}/{{ store.config.tlbSize }} entradas
        </span>
      </div>
    </div>

    <!-- Estado vacío -->
    <div
      v-if="tlb.length === 0"
      class="flex flex-col items-center justify-center py-10 px-4 text-center gap-3"
    >
      <div class="text-3xl opacity-30">⚡</div>
      <p class="text-sm font-medium text-gray-400">TLB vacío</p>
      <p class="text-xs text-gray-600 max-w-xs">
        Las traducciones VPN → PFN aparecerán aquí cuando se ejecuten instrucciones.
        Se vacía automáticamente en cada cambio de contexto.
      </p>
    </div>

    <!-- Tabla de entradas -->
    <div v-else class="overflow-x-auto">
      <table class="w-full text-xs font-mono">
        <thead>
          <tr class="text-gray-500 uppercase text-[10px] tracking-wider border-b border-gray-700/60">
            <th class="px-4 py-2 text-left font-medium">#</th>
            <th class="px-4 py-2 text-left font-medium">VPN</th>
            <th class="px-4 py-2 text-left font-medium">Marco (PFN)</th>
            <th class="px-4 py-2 text-left font-medium">Proceso</th>
            <th class="px-4 py-2 text-left font-medium">Último acceso</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(entry, idx) in tlb"
            :key="`${entry.processId}-${entry.vpn}`"
            class="border-b border-gray-800 transition-colors duration-200"
            :class="isLatest(entry)
              ? 'bg-indigo-500/10 border-indigo-500/20'
              : 'hover:bg-gray-800/50'"
          >
            <!-- Índice con indicador de "nueva" -->
            <td class="px-4 py-2.5 text-gray-600">
              <div class="flex items-center gap-1.5">
                <span>{{ idx }}</span>
                <span
                  v-if="isLatest(entry)"
                  class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"
                />
              </div>
            </td>

            <!-- VPN -->
            <td class="px-4 py-2.5">
              <span
                class="px-1.5 py-0.5 rounded text-xs"
                :class="isLatest(entry) ? 'text-indigo-300' : 'text-cyan-400'"
              >
                {{ entry.vpn }}
              </span>
            </td>

            <!-- PFN -->
            <td class="px-4 py-2.5">
              <span
                class="px-1.5 py-0.5 rounded text-xs"
                :class="isLatest(entry) ? 'text-indigo-300' : 'text-emerald-400'"
              >
                {{ entry.pfn }}
              </span>
            </td>

            <!-- Proceso -->
            <td class="px-4 py-2.5 text-gray-300">
              {{ processName(entry.processId) }}
            </td>

            <!-- Último acceso (tick) -->
            <td class="px-4 py-2.5">
              <span
                class="text-xs"
                :class="isLatest(entry) ? 'text-indigo-400 font-semibold' : 'text-gray-500'"
              >
                tick {{ entry.lastAccessed }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Leyenda de política de reemplazo -->
    <div class="px-4 py-2 border-t border-gray-700/60 bg-gray-800/40">
      <p class="text-[10px] text-gray-600">
        Reemplazo TLB: <span class="text-gray-500 font-medium">LRU</span>
        — la entrada menos usada recientemente se desaloja cuando el TLB está lleno.
      </p>
    </div>
  </div>
</template>
