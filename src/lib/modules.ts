import {
  LayoutDashboard,
  FileText,
  Truck,
  Receipt,
  Factory,
  ShieldCheck,
  Wrench,
  Boxes,
  Package,
  Bot,
  BarChart3,
} from 'lucide-react';
import type { ModuleId } from './types';

export interface NavItem {
  id: ModuleId;
  label: string;
  icon: typeof LayoutDashboard;
  live?: 'green' | 'blue';
}

export const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'sales', label: 'Sales & RFQ', icon: FileText },
  { id: 'procurement', label: 'Procurement', icon: Truck },
  { id: 'ap', label: 'AP Automation', icon: Receipt, live: 'green' },
  { id: 'production', label: 'Production', icon: Factory },
  { id: 'quality', label: 'Quality', icon: ShieldCheck },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'logistics', label: 'Logistics', icon: Package },
  { id: 'assistant', label: 'AI Assistant', icon: Bot, live: 'blue' },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export const moduleMeta: Record<ModuleId, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'AI automation layer — sits on top of your existing systems' },
  sales: { title: 'Sales & RFQ', subtitle: 'AI automation layer — sits on top of your existing systems' },
  procurement: { title: 'Procurement', subtitle: 'AI automation layer — sits on top of your existing systems' },
  ap: { title: 'AP Automation', subtitle: 'AI automation layer — sits on top of your existing systems' },
  production: { title: 'Production', subtitle: 'AI automation layer — sits on top of your existing systems' },
  quality: { title: 'Quality', subtitle: 'AI automation layer — sits on top of your existing systems' },
  maintenance: { title: 'Maintenance', subtitle: 'AI automation layer — sits on top of your existing systems' },
  inventory: { title: 'Inventory', subtitle: 'AI automation layer — sits on top of your existing systems' },
  logistics: { title: 'Logistics', subtitle: 'AI automation layer — sits on top of your existing systems' },
  assistant: { title: 'AI Assistant', subtitle: 'AI automation layer — sits on top of your existing systems' },
  reports: { title: 'Reports', subtitle: 'AI automation layer — sits on top of your existing systems' },
};
