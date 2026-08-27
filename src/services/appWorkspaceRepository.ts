import type { AppWorkspace } from '../domain/workspace'

export interface AppWorkspaceRepository {
  getWorkspace(): Promise<AppWorkspace | null>
  saveWorkspace(workspace: AppWorkspace): Promise<void>
}
