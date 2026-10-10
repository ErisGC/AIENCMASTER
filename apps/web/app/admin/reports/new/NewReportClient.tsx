'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  adminCreateReport,
  adminDeleteReport,
  adminUploadReportDocuments,
  isDocumentOnly,
  type CreateReportPayload,
  type ReportSummary,
} from '@/app/lib/admin-reports';
import { ReportForm } from '../ReportForm';
import styles from '../page.module.css';

export function NewReportClient() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(payload: CreateReportPayload, files: File[]) {
    setSubmitting(true);
    setErrorMessage(null);

    let creado: ReportSummary;
    try {
      creado = await adminCreateReport(payload);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'No se pudo crear el informe.',
      );
      setSubmitting(false);
      return;
    }

    if (files.length > 0) {
      try {
        await adminUploadReportDocuments(creado.id, files);
      } catch (err) {
        const motivo =
          err instanceof Error
            ? err.message
            : 'No se pudieron subir los documentos.';
        if (isDocumentOnly(creado)) {
          // Sin su documento el informe queda vacío: se retira para no dejar
          // un registro sin contenido.
          await adminDeleteReport(creado.id).catch(() => undefined);
          setErrorMessage(
            `No se guardó el informe porque el documento no se pudo subir. ${motivo}`,
          );
          setSubmitting(false);
          return;
        }
        // El formulario sí quedó guardado: se lleva a editar para reintentar
        // solo los documentos.
        router.push(`/admin/reports/${creado.id}/edit?documentos=pendientes`);
        return;
      }
    }

    router.push('/admin/reports');
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/reports" className={styles.backLink}>
            ← Volver a informes
          </Link>
          <h1 className={styles.title}>Nuevo informe</h1>
          <p className={styles.subtitle}>
            Llena el formulario o sube el documento del informe. La cuenta que
            lo crea queda vinculada para trazabilidad ante la DIAN.
          </p>
        </div>
      </header>

      <ReportForm
        submitting={submitting}
        errorMessage={errorMessage}
        onSubmit={handleSubmit}
        onCancel={() => router.push('/admin/reports')}
      />
    </div>
  );
}
