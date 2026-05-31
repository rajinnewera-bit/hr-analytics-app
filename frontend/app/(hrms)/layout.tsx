import { HrmsShell } from "@/components/layout/hrms-shell";

export default function HrmsLayout({ children }: { children: React.ReactNode }) {
  return <HrmsShell>{children}</HrmsShell>;
}
