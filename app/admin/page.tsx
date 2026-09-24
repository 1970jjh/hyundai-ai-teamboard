import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/AdminApp";

export const metadata: Metadata = { title: "관리자 · AI 팀보드", robots: { index: false } };

export default function AdminPage() {
  return <AdminApp />;
}
