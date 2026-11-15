import type { Role } from '@/lib/rbac';

export interface AutomationEvent {
  id: string;
  label: string;
  description: string;
  roles: Role[];
  trigger: 'event' | 'schedule';
}

/** Mirrored in `supabase/migrations/*_automation.sql` and the n8n workflows in `/n8n`. */
export const AUTOMATION_EVENTS: AutomationEvent[] = [
  { id: 'low_stock', label: 'Low-stock notifications', description: 'Total on-hand falls below the reorder level after a stock movement.', roles: ['store_keeper', 'purchase_manager', 'plant_manager', 'company_admin'], trigger: 'event' },
  { id: 'purchase_requisition', label: 'Purchase requisition alerts', description: 'A requisition is submitted for approval.', roles: ['purchase_manager', 'plant_manager', 'company_admin'], trigger: 'event' },
  { id: 'purchase_approval', label: 'Purchase approval notifications', description: 'A purchase order needs approval, or has been approved.', roles: ['purchase_manager', 'plant_manager', 'ceo', 'company_admin'], trigger: 'event' },
  { id: 'shift_update', label: 'Shift production updates', description: 'A supervisor submits a shift production report.', roles: ['production_manager', 'plant_manager'], trigger: 'event' },
  { id: 'below_target', label: 'Below-target production alerts', description: 'Shift output is below the configured % of target.', roles: ['production_manager', 'plant_manager', 'production_supervisor', 'company_admin'], trigger: 'event' },
  { id: 'high_rejection', label: 'High rejection alerts', description: 'Rejection % in a shift or inspection exceeds the threshold.', roles: ['quality_inspector', 'production_manager', 'plant_manager', 'company_admin'], trigger: 'event' },
  { id: 'machine_breakdown', label: 'Machine breakdown alerts', description: 'A breakdown work order is raised.', roles: ['maintenance_technician', 'plant_manager', 'production_manager', 'company_admin'], trigger: 'event' },
  { id: 'pm_reminder', label: 'Preventive maintenance reminders', description: 'PM tasks due within the reminder window.', roles: ['maintenance_technician', 'plant_manager'], trigger: 'schedule' },
  { id: 'invoice_approval', label: 'Supplier invoice approval notifications', description: 'An invoice is sent for payment approval.', roles: ['finance_manager', 'ceo', 'company_admin'], trigger: 'event' },
  { id: 'shipment_delay', label: 'Shipment delay alerts', description: 'A shipment is reported delayed.', roles: ['warehouse_operator', 'plant_manager', 'company_admin'], trigger: 'event' },
  { id: 'daily_digest', label: 'Daily production digest', description: 'Yesterday’s output, OEE, rejections and exceptions.', roles: ['ceo', 'plant_manager', 'production_manager', 'company_admin'], trigger: 'schedule' },
  { id: 'weekly_report', label: 'Weekly management report', description: 'Seven-day cross-module summary.', roles: ['ceo', 'plant_manager', 'company_admin'], trigger: 'schedule' },
];

export const eventLabel = (id: string) => AUTOMATION_EVENTS.find((e) => e.id === id)?.label ?? id;

/** Exponential backoff used by the outbox dispatcher: 1, 4, 16, 64 minutes, then dead-letter. */
export const MAX_ATTEMPTS = 5;
export function nextAttemptDelayMs(attempts: number): number {
  return 60_000 * 4 ** Math.max(0, attempts - 1);
}
