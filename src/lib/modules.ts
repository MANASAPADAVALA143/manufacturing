import {
  LayoutDashboard, FileText, Truck, Receipt, Factory, ShieldCheck, Wrench, Boxes, Package, Bot, BarChart3,
  Smartphone, Settings,
} from 'lucide-react';
import type { ModuleId } from './types';

export interface NavItem {
  id: ModuleId;
  label: string;
  icon: typeof LayoutDashboard;
  group: 'Operations' | 'Commercial' | 'Intelligence' | 'Workspace';
}

export const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Operations' },
  { id: 'production', label: 'Production', icon: Factory, group: 'Operations' },
  { id: 'quality', label: 'Quality', icon: ShieldCheck, group: 'Operations' },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench, group: 'Operations' },
  { id: 'inventory', label: 'Inventory', icon: Boxes, group: 'Operations' },
  { id: 'logistics', label: 'Logistics', icon: Package, group: 'Operations' },
  { id: 'sales', label: 'Sales & RFQ', icon: FileText, group: 'Commercial' },
  { id: 'procurement', label: 'Procurement', icon: Truck, group: 'Commercial' },
  { id: 'ap', label: 'AP Automation', icon: Receipt, group: 'Commercial' },
  { id: 'assistant', label: 'AI Assistant', icon: Bot, group: 'Intelligence' },
  { id: 'reports', label: 'Reports', icon: BarChart3, group: 'Intelligence' },
  { id: 'field', label: 'Field Apps', icon: Smartphone, group: 'Workspace' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'Workspace' },
];

export const moduleMeta: Record<ModuleId, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'Plant-wide performance, exceptions and alerts' },
  sales: { title: 'Sales & RFQ', subtitle: 'Customers, RFQs, quotations and sales orders' },
  procurement: { title: 'Procurement', subtitle: 'Requisitions, sourcing, purchase orders and supplier performance' },
  ap: { title: 'AP Automation', subtitle: 'Invoice capture, 3-way match, approvals and payments' },
  production: { title: 'Production', subtitle: 'Planning, shift output, OEE and the Andon board' },
  quality: { title: 'Quality', subtitle: 'Inspections, non-conformances and CAPA' },
  maintenance: { title: 'Maintenance', subtitle: 'Equipment, preventive schedules and work orders' },
  inventory: { title: 'Inventory', subtitle: 'Stock, movements, batches, audits and reorder planning' },
  logistics: { title: 'Logistics', subtitle: 'Dispatch planning, shipments, vehicles and proof of delivery' },
  assistant: { title: 'AI Assistant', subtitle: 'Ask questions about your company’s operational data' },
  reports: { title: 'Reports', subtitle: 'Operational and financial reports with export and scheduling' },
  field: { title: 'Field Apps', subtitle: 'Mobile workflows for the shop floor' },
  settings: { title: 'Settings', subtitle: 'Company, masters, users, approvals and automation' },
};
