<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSimulatorStore } from '../stores/simulator'

const store = useSimulatorStore()
const { metrics } = storeToRefs(store)

const hitRateColor = computed(() => {
  if (metrics.value.hitRate >= 70) return { bar: 'bg-emerald-500', text: 'text-emerald-400' }
  if (metrics.value.hitRate >= 40) return { bar: 'bg-yellow-500', text: 'text-yellow-400' }
  return { bar: 'bg-red-500', text: 'text-red-400' }
})

const missRate = computed(() =>
  metrics.value.totalAccesses > 0
    ? (metrics.value.tlbMisses / metrics.value.totalAccesses) * 100
    : 0,
)
</script>

<template>
  <div class="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
    <!-- Encabezado -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-white tracking-wide">Métricas</span>
        <span class="text-xs text-gray-400 font-mono">en tiempo real</span>
      </div>
      <span class="text-xs font-mono text-gray-500">
        {{ metrics.totalAccesses }} acceso{{ metrics.totalAccesses !== 1 ? 's' : '' }}
      </span>
    </div>

    <div class="p-4 space-y-3">
      <!-- Fila superior: TLB Hits · TLB Misses · Page Faults -->
      <div class="grid grid-cols-3 gap-3">
        <!-- TLB Hits -->
        <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
          <p class="text-[10px] uppercase tracking-widest text-emerald-500/70 font-medium mb-1">
            TLB Hits
          </p>
          <p class="text-2xl font-mono font-bold text-emerald-400">
            {{ metrics.tlbHits }}
          </p>
        </div>

        <!-- TLB Misses -->
        <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2.5">
          <p class="text-[10px] uppercase tracking-widest text-yellow-500/70 font-medium mb-1">
            TLB Misses
          </p>
          <p class="text-2xl font-mono font-bold text-yellow-400">
            {{ metrics.tlbMisses }}
          </p>
        </div>

        <!-- Page Faults -->
        <div class="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
          <p class="text-[10px] uppercase tracking-widest text-red-500/70 font-medium mb-1">
            Page Faults
          </p>
          <p class="text-2xl font-mono font-bold text-red-400">
            {{ metrics.pageFaults }}
          </p>
        </div>
      </div>

      <!-- Fila inferior: Swap-outs · Swap-ins -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2.5">
          <p class="text-[10px] uppercase tracking-widest text-orange-500/70 font-medium mb-1">
            Swap-outs
          </p>
          <p class="text-2xl font-mono font-bold text-orange-400">
            {{ metrics.swapOuts }}
          </p>
        </div>
        <div class="bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2.5">
          <p class="text-[10px] uppercase tracking-widest text-sky-500/70 font-medium mb-1">
            Swap-ins
          </p>
          <p class="text-2xl font-mono font-bold text-sky-400">
            {{ metrics.swapIns }}
          </p>
        </div>
      </div>

      <!-- Hit Rate — tarjeta con barra de progreso -->
      <div class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-3">
        <div class="flex items-baseline justify-between mb-2">
          <p class="text-[10px] uppercase tracking-widest text-gray-500 font-medium">
            Hit Rate
          </p>
          <p class="font-mono font-bold text-lg" :class="hitRateColor.text">
            {{ metrics.hitRate.toFixed(1) }}<span class="text-sm font-normal">%</span>
          </p>
        </div>

        <!-- Barra de progreso compuesta: hits en verde, misses en amarillo -->
        <div class="h-2 w-full bg-gray-700 rounded-full overflow-hidden flex">
          <div
            class="h-full bg-emerald-500 transition-all duration-500"
            :style="{ width: metrics.hitRate + '%' }"
          />
          <div
            class="h-full bg-yellow-500/60 transition-all duration-500"
            :style="{ width: missRate + '%' }"
          />
        </div>

        <div class="flex justify-between mt-1.5 text-[10px] text-gray-600">
          <span>0%</span>
          <span class="text-gray-500">
            Miss rate: {{ missRate.toFixed(1) }}%
          </span>
          <span>100%</span>
        </div>
      </div>

      <!-- Estado vacío — sin accesos todavía -->
      <p
        v-if="metrics.totalAccesses === 0"
        class="text-center text-xs text-gray-600 pb-1"
      >
        Ejecuta instrucciones para ver las métricas en tiempo real.
      </p>
    </div>
  </div>
</template>
