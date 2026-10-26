import { useState, type ReactNode } from 'react';
import { createModelTaskStore, ModelTasksContext } from './useModelTasks';

export function ModelTasksProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createModelTaskStore);
  return <ModelTasksContext.Provider value={store}>{children}</ModelTasksContext.Provider>;
}
