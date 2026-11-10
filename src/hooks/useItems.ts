import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Item, ItemComponent } from '../types'

export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('*, category:categories(*), components:item_components(*)')
        .order('name')
      if (error) throw error
      return data as Item[]
    },
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: Omit<Item, 'id' | 'created_at' | 'category' | 'components'>) => {
      const { data, error } = await supabase.from('items').insert(item).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}

export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Item> & { id: string }) => {
      // Strip joined relation objects — only scalar columns may be written.
      const { category: _category, components: _components, ...scalars } = updates
      const { data, error } = await supabase.from('items').update(scalars).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}

export function useSaveComponents() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, components }: { itemId: string; components: Omit<ItemComponent, 'id' | 'item_id'>[] }) => {
      await supabase.from('item_components').delete().eq('item_id', itemId)
      if (components.length > 0) {
        const { error } = await supabase.from('item_components').insert(components.map(c => ({ ...c, item_id: itemId })))
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  })
}
