import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Package, PackageItem } from '../types'

export function usePackages() {
  return useQuery({
    queryKey: ['packages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packages')
        .select('*, category:categories(*), package_items(*, item:items(*, components:item_components(*)))')
        .order('name')
      if (error) throw error
      return data as Package[]
    },
  })
}

export function useCreatePackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ pkg, items }: { pkg: Omit<Package, 'id' | 'created_at' | 'category' | 'package_items'>; items: Omit<PackageItem, 'id' | 'package_id'>[] }) => {
      const { data, error } = await supabase.from('packages').insert(pkg).select().single()
      if (error) throw error
      if (items.length > 0) {
        const { error: e2 } = await supabase.from('package_items').insert(items.map(i => ({ ...i, package_id: data.id })))
        if (e2) throw e2
      }
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  })
}

export function useUpdatePackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, pkg, items }: { id: string; pkg: Omit<Package, 'id' | 'created_at' | 'category' | 'package_items'>; items: Omit<PackageItem, 'id' | 'package_id'>[] }) => {
      const { error } = await supabase.from('packages').update(pkg).eq('id', id)
      if (error) throw error
      await supabase.from('package_items').delete().eq('package_id', id)
      if (items.length > 0) {
        const { error: e2 } = await supabase.from('package_items').insert(items.map(i => ({ ...i, package_id: id })))
        if (e2) throw e2
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  })
}

export function useDeletePackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('packages').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  })
}
