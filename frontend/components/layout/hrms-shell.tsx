"use client";

import type { ReactNode } from "react";
import { UploadWorkspaceBoundary } from "@/components/upload-workspace-boundary";
import { UploadWorkspaceProvider } from "@/context/upload-workspace-context";
import { HrmsSidebar } from "@/components/layout/hrms-sidebar";
import { HrmsTopbar } from "@/components/layout/hrms-topbar";

export function HrmsShell({ children }: { children: ReactNode }) {
  return (
    <UploadWorkspaceProvider>
      <div className="flex min-h-screen">
        <HrmsSidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <HrmsTopbar />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 lg:p-6">
            <UploadWorkspaceBoundary>
              <div className="mx-auto flex min-h-0 w-full max-w-[1380px] flex-1 flex-col">
                {children}
              </div>
            </UploadWorkspaceBoundary>
          </main>
        </div>
      </div>
    </UploadWorkspaceProvider>
  );
}
