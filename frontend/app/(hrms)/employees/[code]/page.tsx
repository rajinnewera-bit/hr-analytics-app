import { redirect } from "next/navigation";
import { isReservedEmployeeRoute } from "@/lib/employee-code-url";
import { EmployeeProfileRoute } from "./employee-profile-route";

type EmployeeProfilePageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ mode?: string; tab?: string }>;
};

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: EmployeeProfilePageProps) {
  const { code } = await params;

  if (isReservedEmployeeRoute(code)) {
    redirect("/employees/new");
  }

  const query = await searchParams;

  return <EmployeeProfileRoute code={code} mode={query.mode} tab={query.tab} />;
}
