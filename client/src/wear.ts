import { AvatarConfig, ItemDef, isGearSlot } from '@dovey/shared';

/** The avatar change that puts an owned item on: gear by id, garments keep your colour when the item comes in it. */
export function wearPatch(cfg: AvatarConfig, item: ItemDef): Partial<AvatarConfig> {
  if (isGearSlot(item.slot)) return { [item.slot]: item.id };
  const key = `${item.slot}Colour` as keyof AvatarConfig;
  const current = cfg[key] as string;
  return { [item.slot]: item.id, [key]: item.variants.includes(current) ? current : item.variants[0] };
}
