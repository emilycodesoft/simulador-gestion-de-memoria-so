<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSimulatorStore } from '../stores/simulator'

const store = useSimulatorStore()
const { stepper } = storeToRefs(store)

const currentStep = computed(() => stepper.value.steps[stepper.value.currentIdx] ?? null)
const total = computed(() => stepper.value.steps.length)
const idx = computed(() => stepper.value.currentIdx)
const isLast = computed(() => idx.value === total.value - 1)
const canAdvance = computed(() => stepper.value.running && idx.value < total.value)

const TYPE_STYLE = {
  hit:    { bar: 'bg-emerald-500', text: 'text-emerald-300', badge: 'bg-emerald-500/15 border-emerald-500/30' },
  miss:   { bar: 'bg-yellow-500',  text: 'text-yellow-300',  badge: 'bg-yellow-500/15 border-yellow-500/30'  },
  fault:  { bar: 'bg-red-500',     text: 'text-red-300',     badge: 'bg-red-500/15 border-red-500/30'        },
  error:  { bar: 'bg-red-700',     text: 'text-red-400',     badge: 'bg-red-900/20 border-red-800/40'        },
  switch: { bar: 'bg-gray-500',    text: 'text-gray-400',    badge: 'bg-gray-700/30 border-gray-600/40'      },
  info:   { bar: 'bg-blue-500',    text: 'text-blue-300',    badge: 'bg-blue-500/15 border-blue-500/30'      },
}

function style(type) {
  return TYPE_STYLE[type] ?? TYPE_STYLE.info
}
</script>

<template>
  <div class="bg-gray-900/95 backdrop-blur-sm rounded-2xl border border-gray-700/80 overflow-hidden">

    <!-- Barra de progreso -->
    <div class="h-0.5 bg-gray-800 relative">
      <div
        class="h-full transition-all duration-300"
        :class="currentStep ? style(currentStep.type).bar : 'bg-gray-700'"
        :style="{ width: total > 0 ? `${(idx / total) * 100}%` : '0%' }"
      />
    </div>

    <!-- Paso actual -->
    <div class="px-4 pt-3 pb-2">
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[10px] font-mono text-gray-600">paso {{ idx + 1 }} / {{ total }}</span>
        <span
          v-if="currentStep"
          class="text-[10px] font-mono px-1.5 py-0.5 rounded border"
          :class="style(currentStep.type).badge"
        >
          {{ currentStep.type.toUpperCase() }}
        </span>
      </div>

      <template v-if="currentStep">
        <p class="text-sm font-semibold" :class="style(currentStep.type).text">
          {{ currentStep.label }}
        </p>
        <p class="text-[11px] text-gray-400 mt-0.5 leading-snug line-clamp-2">
          {{ currentStep.detail }}
        </p>
      </template>
      <p v-else class="text-xs text-gray-500">Instrucción completada.</p>
    </div>

    <!-- Controles -->
    <div class="px-3 pb-3 flex items-center gap-2">
      <button
        @click="store.advanceStep()"
        :disabled="!canAdvance"
        class="flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :class="isLast
          ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
          : 'bg-blue-700 hover:bg-blue-600 text-white'"
      >
        {{ isLast ? 'Finalizar ✓' : 'Siguiente →' }}
      </button>

      <button
        @click="store.replayAnimation()"
        :disabled="!stepper.running"
        title="Repetir animación"
        class="w-8 h-8 flex items-center justify-center text-sm text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-30"
      >↺</button>

      <button
        @click="store.completeAllSteps()"
        :disabled="!canAdvance"
        title="Completar todo"
        class="w-8 h-8 flex items-center justify-center text-sm text-gray-500 hover:text-gray-300 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-30"
      >⏭</button>
    </div>
  </div>
</template>
