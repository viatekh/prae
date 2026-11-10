import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ProjectCrew } from '../types'

export function useProjectCrew(projectId: string) {
  return useQuery({
    queryKey: ['project-crew', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_crew')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ProjectCrew[]
    },
    enabled: !!projectId,
  })
}

export function useAddCrewMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ project_id, name, role }: { project_id: string; name: string; role: string | null }) => {
      const { data, error } = await supabase.from('project_crew').insert({ project_id, name, role }).select().single()
      if (error) throw error
      return data as ProjectCrew
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['project-crew', vars.project_id] }),
  })
}

export function useRemoveCrewMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, project_id: _project_id }: { id: string; project_id: string }) => {
      const { error } = await supabase.from('project_crew').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['project-crew', vars.project_id] }),
  })
}
