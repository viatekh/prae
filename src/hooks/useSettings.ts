import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Settings } from '../types'

function parseSettings(rows: { key: string; value: string }[]): Settings {
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return {
    company_name: map.company_name || '',
    company_address: map.company_address || '',
    company_email: map.company_email || '',
    company_phone: map.company_phone || '',
    company_website: map.company_website || '',
    company_reg: map.company_reg || '',
    vat_enabled: map.vat_enabled === 'true',
    vat_rate: parseFloat(map.vat_rate || '20'),
    quote_prefix: map.quote_prefix || 'QUOTE',
    quote_next_number: parseInt(map.quote_next_number || '1'),
    payment_terms: map.payment_terms || '',
    tc_text: map.tc_text || '',
    freeagent_url: map.freeagent_url || '',
    email_via: map.email_via === 'default' ? 'default' : 'gmail',
    chase_quote_days: parseInt(map.chase_quote_days || '3') || 3,
    payment_days: parseInt(map.payment_days || '14') || 14,
    email_signature: map.email_signature || '',
  }
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*')
      if (error) throw error
      return parseSettings(data)
    },
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settings: Partial<Settings>) => {
      const rows = Object.entries(settings).map(([key, value]) => ({ key, value: String(value) }))
      for (const row of rows) {
        await supabase.from('settings').upsert(row, { onConflict: 'key' })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })
}

// Categories CRUD
export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, sort_order }: { name: string; sort_order: number }) => {
      const { data, error } = await supabase.from('categories').insert({ name, sort_order }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, sort_order }: { id: string; name: string; sort_order: number }) => {
      const { error } = await supabase.from('categories').update({ name, sort_order }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}
