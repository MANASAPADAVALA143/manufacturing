export type ModuleId =
  | 'overview'
  | 'sales'
  | 'procurement'
  | 'ap'
  | 'production'
  | 'quality'
  | 'maintenance'
  | 'inventory'
  | 'logistics'
  | 'assistant'
  | 'reports';

export interface ModuleMeta {
  id: ModuleId;
  label: string;
  subtitle: string;
}
