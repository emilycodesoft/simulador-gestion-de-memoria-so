import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSimulatorStore } from '../stores/simulator'

export function useStepControls() {
  const store = useSimulatorStore()
  const { stepper } = storeToRefs(store)

  // TODO: implementa los siguientes computeds (5-10 líneas en total).
  //
  // currentStep  → el objeto del paso actual: stepper.steps[currentIdx]
  //                (null si no hay pasos)
  //
  // isLastStep   → true si currentIdx apunta al último paso del array
  //
  // canAdvance   → true si el stepper está running Y no es el último paso
  //                (el botón "Siguiente" solo aplica si hay un paso que avanzar)
  //
  // canGoBack    → true si el stepper está running Y currentIdx > 0
  //                (no se puede retroceder del primer paso)
  //
  // Datos disponibles en stepper.value:
  //   .running     Boolean — indica si hay una instrucción en progreso
  //   .steps       Array   — lista de pasos pre-computados
  //   .currentIdx  Number  — índice del paso activo

  const currentStep = computed(() => /* ... */ null)
  const isLastStep  = computed(() => /* ... */ false)
  const canAdvance  = computed(() => /* ... */ false)
  const canGoBack   = computed(() => /* ... */ false)

  return { currentStep, isLastStep, canAdvance, canGoBack }
}
