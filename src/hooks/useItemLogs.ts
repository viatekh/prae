import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ItemLog } from '../types'

export function useItemLogs(itemId: string) {
  return useQuery({
    queryKey: ['item-logs', itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_logs')
        .select('*, author:profiles(full_name, email)')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ItemLog[]
    },
    enabled: !!itemId,
  })
}

export function useAddItemLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ item_id, note }: { item_id: string; note: string }) => {
      const { data: auth } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('item_logs')
        .insert({ item_id, note, author_id: auth.user?.id ?? null })
        .select().single()
      if (error) throw error
      return data as ItemLog
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['item-logs', vars.item_id] }),
  })
}

export function useDeleteItemLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, item_id: _item_id }: { id: string; item_id: string }) => {
      const { error } = await supabase.from('item_logs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['item-logs', vars.item_id] }),
  })
}
