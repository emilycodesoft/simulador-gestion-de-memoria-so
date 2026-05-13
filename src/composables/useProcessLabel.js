import { useSimulatorStore } from '../stores/simulator'

export function useProcessLabel() {
  const store = useSimulatorStore()

  function processName(processId) {
    return store.processes.find(p => p.id === processId)?.name ?? `P${processId}`
  }

  return { processName }
}
