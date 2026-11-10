import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ProjectLog } from '../types'

export function useProjectLogs(projectId: string) {
  return useQuery({
    queryKey: ['project-logs', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_logs')
        .select('*, author:profiles(full_name, email)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ProjectLog[]
    },
    enabled: !!projectId,
  })
}

export function useAddProjectLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ project_id, message }: { project_id: string; message: string }) => {
      // Stamp the author so the log says who wrote what.
      const { data: auth } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('project_logs')
        .insert({ project_id, message, author_id: auth.user?.id ?? null })
        .select().single()
      if (error) throw error
      return data as ProjectLog
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['project-logs', vars.project_id] }),
  })
}

export function useDeleteProjectLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, project_id: _project_id }: { id: string; project_id: string }) => {
      const { error } = await supabase.from('project_logs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['project-logs', vars.project_id] }),
  })
}
