import { describe, it, expect } from 'vitest'
import { componentsByParent } from './lines'
import type { LineItemDraft } from '../types'

const line = (description: string, is_component: boolean, ids: { item_id?: string | null; package_id?: string | null } = {}) =>
  ({ description, is_component, item_id: ids.item_id ?? null, package_id: ids.package_id ?? null }) as LineItemDraft

describe('componentsByParent', () => {
  it('gives each line only the rows that follow it', () => {
    const deck = line('Deck', false, { item_id: 'deck' })
    const lid = line('Lid', true, { item_id: 'deck' })
    const mixer = line('Mixer', false, { item_id: 'mixer' })
    const pkg = line('DJ package', false, { package_id: 'p1' })
    const a = line('CDJ', true, { item_id: 'cdj', package_id: 'p1' })
    const b = line('Mixer', true, { item_id: 'mixer', package_id: 'p1' })
    const crew = line('Crew', false)
    const map = componentsByParent([deck, lid, mixer, pkg, a, b, crew])
    expect(map.get(deck)).toEqual([lid])
    expect(map.get(mixer)).toEqual([])
    expect(map.get(pkg)).toEqual([a, b])
    expect(map.get(crew)).toEqual([])
  })

  it('does not hand null-id components to unrelated lines', () => {
    const svc1 = line('Delivery', false)
    const svc2 = line('Install', false)
    const note = line('Ramp', true)
    const map = componentsByParent([svc1, note, svc2])
    expect(map.get(svc1)).toEqual([note])
    expect(map.get(svc2)).toEqual([])
  })
})
