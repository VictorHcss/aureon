import type { Metadata } from "next";
import { ProductForm } from "@/components/forms";
import { ErrorNotice, PageHeader, Section, SetupNotice } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/db/client";
import { listCategories } from "@/lib/db/queries";
import { errorMessage } from "@/lib/logger";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NewProductPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;
  let categories;
  try {
    categories = await listCategories();
  } catch (e) {
    return <ErrorNotice message={errorMessage(e)} />;
  }
  return (
    <>
      <PageHeader title="Novo produto" description="Depois de salvar, você adiciona os links das lojas e as regras de alerta." />
      <Section className="max-w-3xl">
        <ProductForm categories={categories} />
      </Section>
    </>
  );
}
