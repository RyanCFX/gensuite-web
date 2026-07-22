import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import {
  getInvoice,
  submitInvoice,
  cancelInvoice,
  amendInvoice,
  downloadInvoicePdf,
  aplicarSaldoFavor,
  removerSaldoFavor,
  asignarTrackingFactura,
} from "@/shared/api/invoices";
import { getCustomer } from "@/shared/api/customers";
import { getSaldoFavor } from "@/shared/api/cobros";
import {
  getCreditNoteSaldoFavor,
  aplicarCreditNoteAFactura,
  removerCreditNoteAplicada,
} from "@/shared/api/notes";
import { listMetodosPago, getFacturacionConfig, listDenominaciones } from "@/shared/api/config";
import { createDevolucion } from "@/shared/api/devoluciones";
import { getItem } from "@/shared/api/catalog";
import { getBundle } from "@/shared/api/bundles";
import type { ApiError, SubmitInvoiceDto, ComponentTracking } from "@/shared/api/types";
import { PaymentLinesEditor } from "@/components/shared/PaymentLinesEditor";
import {
  EMPTY_PAYMENT_LINES_VALUE,
  isPaymentLinesValid,
  buildSubmitPayload,
} from "@/lib/paymentLines";
import {
  ArrowLeft,
  Send,
  XCircle,
  FileEdit,
  Download,
  AlertTriangle,
  Ban,
  Wallet,
  RotateCcw,
  Receipt,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatDate,
  formatDateTime,
  formatDOP,
  displayId,
} from "@/lib/formatters";
import { NCF_TYPES } from "@/lib/constants";
import { DocumentHistoryCard } from "@/components/shared/DocumentHistoryCard";
import { SearchSelect } from "@/shared/ui/SearchSelect";
import type { SearchSelectOption } from "@/shared/ui/SearchSelect";
import { ComponentTrackingModal } from "@/components/shared/ComponentTrackingModal";
import type { TrackedComponent } from "@/components/shared/ComponentTrackingModal";

const CREDIT_NOTE_MODE_OF_PAYMENT = "Nota de crédito";

const RETURN_RESOLUTION_OPTIONS: SearchSelectOption[] = [
  { value: "credit_note_only", label: "Saldo a favor" },
  { value: "refund", label: "Reembolsar ahora" },
];

const STATUS_BADGE: Record<string, string> = {
  Draft: "badge-draft",
  Submitted: "badge-submitted",
  Cancelled: "badge-cancelled",
};
const STATUS_LABEL: Record<string, string> = {
  Draft: "Borrador",
  Submitted: "Sometido",
  Cancelled: "Cancelado",
};

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [payCash, setPayCash] = useState(false);
  const [modeOfPayment, setModeOfPayment] = useState("");
  const [cashPayments, setCashPayments] = useState(EMPTY_PAYMENT_LINES_VALUE);
  const [creditErrorOpen, setCreditErrorOpen] = useState(false);
  const [creditErrorMsg, setCreditErrorMsg] = useState("");
  const [lastSubmitBody, setLastSubmitBody] = useState<SubmitInvoiceDto | undefined>(undefined);
  const [trackingRecovery, setTrackingRecovery] = useState<TrackedComponent | null>(null);
  const [trackingRecoveryLoading, setTrackingRecoveryLoading] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelForbiddenMsg, setCancelForbiddenMsg] = useState("");
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnFullInvoice, setReturnFullInvoice] = useState(true);
  const [returnRows, setReturnRows] = useState<
    {
      itemCode: string;
      description: string;
      qtyPurchased: number;
      qty: number;
      checked: boolean;
    }[]
  >([]);
  const [returnResolution, setReturnResolution] = useState<
    "refund" | "credit_note_only"
  >("credit_note_only");
  const [returnModeOfPayment, setReturnModeOfPayment] = useState("");
  const [returnReason, setReturnReason] = useState("");

  const [modeOfPaymentSearch, setModeOfPaymentSearch] = useState("");
  const [modeOfPaymentRetrySearch, setModeOfPaymentRetrySearch] = useState("");
  const [returnResolutionSearch, setReturnResolutionSearch] = useState("");
  const [returnModeOfPaymentSearch, setReturnModeOfPaymentSearch] =
    useState("");

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => getInvoice(id!),
    enabled: !!id,
  });

  const { data: customer } = useQuery({
    queryKey: ["customer", invoice?.customer],
    queryFn: () => getCustomer(invoice!.customer),
    enabled: !!invoice?.customer && invoice.status === "draft",
  });

  const { data: metodos } = useQuery({
    queryKey: ["metodos-pago"],
    queryFn: listMetodosPago,
    enabled: invoice?.status === "draft" || invoice?.status === "submitted",
    staleTime: 5 * 60_000,
  });

  const { data: denominaciones } = useQuery({
    queryKey: ["denominaciones"],
    queryFn: listDenominaciones,
    enabled: invoice?.status === "draft",
    staleTime: 5 * 60_000,
  });

  const { data: facturacionConfig } = useQuery({
    queryKey: ["facturacion-config"],
    queryFn: getFacturacionConfig,
    enabled: invoice?.status === "draft",
    staleTime: 5 * 60_000,
  });
  // Si la llamada falla o el campo no viene, se trata como "directo" (comportamiento histórico/seguro).
  const flujoCobro = facturacionConfig?.flujoCobro ?? "directo";

  const metodosOptions: SearchSelectOption[] = useMemo(() => {
    const q = modeOfPaymentSearch.toLowerCase();
    return (metodos ?? [])
      .filter((m) => !m.disabled)
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => ({ value: m.name, label: m.name }));
  }, [metodos, modeOfPaymentSearch]);

  const metodosRetryOptions: SearchSelectOption[] = useMemo(() => {
    const q = modeOfPaymentRetrySearch.toLowerCase();
    return (metodos ?? [])
      .filter((m) => !m.disabled)
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => ({ value: m.name, label: m.name }));
  }, [metodos, modeOfPaymentRetrySearch]);

  const returnModeOptions: SearchSelectOption[] = useMemo(() => {
    const q = returnModeOfPaymentSearch.toLowerCase();
    return (metodos ?? [])
      .filter((m) => !m.disabled)
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => ({ value: m.name, label: m.name }));
  }, [metodos, returnModeOfPaymentSearch]);

  // Si la factura original tiene saldo pendiente (venta a crédito sin pagar), el backend
  // rechaza resolution="refund" con 400 — no se ofrece esa opción en el selector.
  const hasOutstandingBalance = (invoice?.outstandingAmount ?? 0) > 0;

  const returnResolutionOptions: SearchSelectOption[] = useMemo(() => {
    const q = returnResolutionSearch.toLowerCase();
    return RETURN_RESOLUTION_OPTIONS.filter((o) => o.value !== "refund" || !hasOutstandingBalance).filter(
      (o) => !q || o.label.toLowerCase().includes(q),
    );
  }, [returnResolutionSearch, hasOutstandingBalance]);

  const { data: saldoFavor } = useQuery({
    queryKey: ["saldo-favor", invoice?.customer],
    queryFn: () => getSaldoFavor(invoice!.customer),
    enabled:
      !!invoice?.customer &&
      (invoice.status === "draft" || invoice.status === "submitted"),
  });

  const [saldoAmounts, setSaldoAmounts] = useState<Record<string, number>>({});

  const applySaldoMutation = useMutation({
    mutationFn: ({
      paymentEntryId,
      amount,
    }: {
      paymentEntryId: string;
      amount: number;
    }) => aplicarSaldoFavor(id!, { paymentEntryId, amount }),
    onSuccess: (_updated, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({
        queryKey: ["saldo-favor", invoice?.customer],
      });
      toast.success(
        `Saldo a favor de ${formatDOP(variables.amount)} aplicado. Somete la factura para reconciliarlo.`,
      );
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? "Error al aplicar el saldo a favor");
    },
  });

  const removeSaldoMutation = useMutation({
    mutationFn: (paymentEntryId: string) =>
      removerSaldoFavor(id!, paymentEntryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({
        queryKey: ["saldo-favor", invoice?.customer],
      });
      toast.success("Saldo a favor removido de esta factura");
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? "Error al remover el saldo a favor");
    },
  });

  const { data: creditNoteSaldo } = useQuery({
    queryKey: ["credit-note-saldo-favor", invoice?.customer],
    queryFn: () => getCreditNoteSaldoFavor(invoice!.customer),
    enabled:
      !!invoice?.customer &&
      (invoice.status === "draft" || invoice.status === "submitted"),
  });

  const [creditNoteAmounts, setCreditNoteAmounts] = useState<
    Record<string, number>
  >({});

  const applyCreditNoteMutation = useMutation({
    mutationFn: ({
      creditNoteId,
      amount,
    }: {
      creditNoteId: string;
      amount: number;
    }) => aplicarCreditNoteAFactura(creditNoteId, { invoiceId: id!, amount }),
    onSuccess: (_updated, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({
        queryKey: ["credit-note-saldo-favor", invoice?.customer],
      });
      toast.success(
        `Nota de crédito de ${formatDOP(variables.amount)} aplicada. Somete la factura para reconciliarla.`,
      );
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        // Ya estaba aplicada a esta factura (doble clic, reintento, o otra pestaña) — refrescar para reflejar el estado real
        queryClient.invalidateQueries({
          queryKey: ["credit-note-saldo-favor", invoice?.customer],
        });
      }
      toast.error(err?.message ?? "Error al aplicar la nota de crédito");
    },
  });

  const removeCreditNoteMutation = useMutation({
    mutationFn: (creditNoteId: string) =>
      removerCreditNoteAplicada(creditNoteId, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({
        queryKey: ["credit-note-saldo-favor", invoice?.customer],
      });
      toast.success("Nota de crédito removida de esta factura");
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? "Error al remover la nota de crédito");
    },
  });

  // Total del saldo a favor ya aplicado a ESTA factura (sum de appliedTo de todos los Payment Entry)
  const creditoAplicadoSaldoFavor = (saldoFavor?.entries ?? []).reduce(
    (sum, entry) => {
      const applied = entry.appliedTo?.find((a) => a.invoiceId === id);
      return sum + (applied?.allocatedAmount ?? 0);
    },
    0,
  );

  // Total de notas de crédito ya aplicadas a ESTA factura
  const creditoAplicadoNotas = (creditNoteSaldo?.entries ?? []).reduce(
    (sum, entry) => {
      const applied = entry.appliedTo?.find((a) => a.invoiceId === id);
      return sum + (applied?.amount ?? 0);
    },
    0,
  );

  const creditoAplicado = creditoAplicadoSaldoFavor + creditoAplicadoNotas;
  // Lo que realmente queda pendiente en esta factura (antes de someter) — el backend valida contra esto,
  // no contra el grandTotal bruto, ya que puede haber crédito ya aplicado previamente.
  const pendingAmount = invoice
    ? Math.max(0, invoice.grandTotal - creditoAplicado)
    : 0;

  const noCredit = invoice?.status === "draft" && customer?.hasCredit === false;
  // Cubierta al 100% por crédito ya aplicado (saldo a favor y/o notas de crédito) — no hace falta cobrar al contado.
  const paidByCreditNote =
    !!invoice &&
    invoice.status === "draft" &&
    invoice.grandTotal > 0 &&
    creditoAplicado > 0 &&
    pendingAmount <= 0.01;
  const showCashSelector = !paidByCreditNote && (noCredit || payCash);

  const submitMutation = useMutation({
    mutationFn: (body?: SubmitInvoiceDto) => submitInvoice(id!, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      setCreditErrorOpen(false);
      setPayCash(false);
      setModeOfPayment("");
      setCashPayments(EMPTY_PAYMENT_LINES_VALUE);
      toast.success(
        updated.paymentStatus === "paid"
          ? "Factura sometida y cobrada al contado"
          : "Factura sometida — NCF asignado",
      );
    },
    onError: (err: { message?: string }) => {
      const msg = err?.message ?? "";
      if (/excede\s+el\s+cr[eé]dito\s+disponible/i.test(msg)) {
        setCreditErrorMsg(msg);
        setCreditErrorOpen(true);
        return;
      }
      if (/serial\s*no|batch\s*no/i.test(msg) && /mandatory/i.test(msg)) {
        resolveTrackingError(msg);
        return;
      }
      toast.error(msg || "Error al someter la factura");
    },
  });

  // Cuando ERPNext no pudo auto-asignar serial/lote al someter, ubica a qué línea/almacén
  // pertenece el artículo del mensaje de error (puede ser una línea directa o un componente
  // de un Combo) para abrir el selector correcto.
  async function resolveTrackingError(msg: string) {
    const match = msg.match(/item\s+([A-Za-z0-9_.-]+)/i);
    const parsedCode = match?.[1];
    if (!parsedCode || !invoice) {
      toast.error(msg);
      return;
    }
    setTrackingRecoveryLoading(true);
    try {
      const directLine = invoice.items.find((i) => i.itemCode === parsedCode);
      if (directLine) {
        const item = await getItem(parsedCode).catch(() => null);
        setTrackingRecovery({
          itemCode: parsedCode,
          itemName: item?.itemName,
          trackingType: item?.trackingType === "batch" ? "batch" : "serial",
          qtyNeeded: directLine.qty,
          warehouse: directLine.warehouse,
        });
        return;
      }

      // No es una línea directa — busca entre los Combos de la factura cuál lo incluye como componente.
      for (const line of invoice.items) {
        try {
          const bundle = await getBundle(line.itemCode);
          const comp = bundle.components.find((c) => c.itemCode === parsedCode);
          if (comp) {
            const item = await getItem(parsedCode).catch(() => null);
            setTrackingRecovery({
              itemCode: parsedCode,
              itemName: item?.itemName ?? comp.itemName,
              trackingType: item?.trackingType === "batch" ? "batch" : "serial",
              qtyNeeded: comp.qty * line.qty,
              warehouse: line.warehouse,
            });
            return;
          }
        } catch {
          // La línea no es un Combo — se ignora y se sigue buscando en las demás.
        }
      }

      // No se pudo ubicar la línea/almacén exacto — igual se muestra el selector con lo disponible.
      const item = await getItem(parsedCode).catch(() => null);
      setTrackingRecovery({
        itemCode: parsedCode,
        itemName: item?.itemName,
        trackingType: item?.trackingType === "batch" ? "batch" : "serial",
        qtyNeeded: 1,
      });
    } finally {
      setTrackingRecoveryLoading(false);
    }
  }

  const assignTrackingRecoveryMutation = useMutation({
    mutationFn: (tracking: ComponentTracking[]) =>
      asignarTrackingFactura(id!, tracking),
    onSuccess: () => {
      setTrackingRecovery(null);
      toast.success("Serial/lote asignado — reintentando someter la factura…");
      submitMutation.mutate(lastSubmitBody);
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? "No se pudo asignar el serial/lote");
    },
  });

  // Asignación proactiva desde la sección "Pendiente de serial/lote" — no fuerza el submit,
  // solo refresca el detalle para que pendingTracking se actualice.
  const [pendingTrackingModalOpen, setPendingTrackingModalOpen] = useState(false);
  const assignPendingTrackingMutation = useMutation({
    mutationFn: (tracking: ComponentTracking[]) =>
      asignarTrackingFactura(id!, tracking),
    onSuccess: () => {
      setPendingTrackingModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      toast.success("Serial/lote asignado");
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? "No se pudo asignar el serial/lote");
    },
  });

  function buildCashSubmitBody(): SubmitInvoiceDto {
    if (flujoCobro === "caja") {
      return { payCash: true, ...buildSubmitPayload(cashPayments) };
    }
    return { payCash: true, payments: [{ modeOfPayment, amount: pendingAmount }] };
  }

  function isCashReadyToSubmit(): boolean {
    if (flujoCobro === "caja") {
      return isPaymentLinesValid(cashPayments, pendingAmount, metodos ?? [], denominaciones ?? []);
    }
    return !!modeOfPayment;
  }

  function handleSubmitClick() {
    if (showCashSelector) {
      if (!isCashReadyToSubmit()) {
        toast.error(
          flujoCobro === "caja"
            ? "Verifica que el total ingresado coincida con el monto a cobrar"
            : "Selecciona un método de pago",
        );
        return;
      }
      const body = buildCashSubmitBody();
      setLastSubmitBody(body);
      submitMutation.mutate(body);
    } else {
      setLastSubmitBody(undefined);
      submitMutation.mutate(undefined);
    }
  }

  function handleCashRetry() {
    if (!isCashReadyToSubmit()) {
      toast.error(
        flujoCobro === "caja"
          ? "Verifica que el total ingresado coincida con el monto a cobrar"
          : "Selecciona un método de pago",
      );
      return;
    }
    const body = buildCashSubmitBody();
    setLastSubmitBody(body);
    submitMutation.mutate(body);
  }

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelInvoice(id!, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      toast.success("Factura cancelada");
      setCancelModalOpen(false);
      setCancelReason("");
      setCancelForbiddenMsg("");
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        toast.error("La factura ya está cancelada.");
        queryClient.invalidateQueries({ queryKey: ["invoice", id] });
        setCancelModalOpen(false);
        return;
      }
      if (err?.statusCode === 403) {
        setCancelForbiddenMsg(
          err.message || "No tienes permiso para cancelar esta factura.",
        );
        return;
      }
      toast.error(err?.message ?? "Error al cancelar la factura");
    },
  });

  function openCancelModal() {
    setCancelReason("");
    setCancelForbiddenMsg("");
    setCancelModalOpen(true);
  }

  const cancelReasonValid =
    cancelReason.trim().length >= 10 && cancelReason.trim().length <= 500;

  function openReturnModal() {
    setReturnFullInvoice(true);
    setReturnRows(
      (invoice?.items ?? []).map((i) => ({
        itemCode: i.itemCode,
        description: i.description || i.itemCode,
        qtyPurchased: i.qty,
        qty: i.qty,
        checked: false,
      })),
    );
    setReturnResolution("credit_note_only");
    setReturnModeOfPayment("");
    setReturnReason("");
    setReturnModalOpen(true);
  }

  function toggleReturnRow(itemCode: string) {
    setReturnRows((prev) =>
      prev.map((r) =>
        r.itemCode === itemCode ? { ...r, checked: !r.checked } : r,
      ),
    );
  }

  function setReturnRowQty(itemCode: string, qty: number) {
    setReturnRows((prev) =>
      prev.map((r) => (r.itemCode === itemCode ? { ...r, qty } : r)),
    );
  }

  const returnCheckedRows = returnRows.filter((r) => r.checked);
  const returnReasonValid =
    returnReason.trim().length >= 10 && returnReason.trim().length <= 500;
  const returnModeValid =
    returnResolution !== "refund" || !!returnModeOfPayment;
  const returnItemsValid =
    returnFullInvoice ||
    (returnCheckedRows.length > 0 &&
      returnCheckedRows.every((r) => r.qty > 0 && r.qty <= r.qtyPurchased));
  const canConfirmReturn =
    returnReasonValid && returnModeValid && returnItemsValid;

  const devolucionMutation = useMutation({
    mutationFn: () =>
      createDevolucion({
        invoiceId: id!,
        items: returnFullInvoice
          ? undefined
          : returnCheckedRows.map((r) => ({
              itemCode: r.itemCode,
              qty: r.qty,
            })),
        resolution: returnResolution,
        refundModeOfPayment:
          returnResolution === "refund" ? returnModeOfPayment : undefined,
        reason: returnReason.trim(),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      toast.success(result.message ?? "Devolución procesada correctamente", {
        duration: result.appliedToOriginalInvoice ? 8000 : undefined,
      });
      setReturnModalOpen(false);
      navigate("/notas-credito");
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? "Error al procesar la devolución");
    },
  });

  const amendMutation = useMutation({
    mutationFn: () => amendInvoice(id!),
    onSuccess: (newInvoice) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Enmienda creada como borrador");
      navigate(`/facturas/${newInvoice.id}`);
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? "Error al enmendar la factura");
    },
  });

  const isActionsLoading =
    submitMutation.isPending ||
    cancelMutation.isPending ||
    amendMutation.isPending;

  const downloadMutation = useMutation({
    mutationFn: () => downloadInvoicePdf(id!, `factura-${id}.pdf`),
    onError: () => toast.error("No se pudo descargar el PDF"),
  });

  if (isLoading) {
    return (
      <div className="page-container">
        <div
          className="skeleton-box"
          style={{ width: 280, height: 28, marginBottom: 8 }}
        />
        <div
          className="skeleton-box"
          style={{
            width: "100%",
            height: 160,
            borderRadius: "var(--radius-lg)",
            marginBottom: 16,
          }}
        />
        <div
          className="skeleton-box"
          style={{
            width: "100%",
            height: 256,
            borderRadius: "var(--radius-lg)",
          }}
        />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-title">Factura no encontrada</div>
          <button
            className="btn btn-ghost btn-size-sm"
            onClick={() => navigate("/facturas")}
          >
            Volver a facturas
          </button>
        </div>
      </div>
    );
  }

  const ncfLabel = NCF_TYPES.find((t) => t.value === invoice.ncfType)?.label;
  const ps = invoice.paymentStatus;

  const outstandingColor =
    ps === "paid"
      ? "var(--color-success)"
      : ps === "partly_paid"
        ? "var(--color-brand)"
        : "var(--color-error)";

  const PAYMENT_BADGE: Record<string, string> = {
    unpaid: "badge-warning",
    partly_paid: "badge-info",
    paid: "badge-success",
  };
  const PAYMENT_LABEL: Record<string, string> = {
    unpaid: "Pendiente",
    partly_paid: "Parcial",
    paid: "Pagado",
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a
            className="page-back-link"
            onClick={() => navigate("/facturas")}
          >
            <ArrowLeft size={14} /> Facturas
          </a>
          <h1
            className="page-title"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            Factura {displayId(invoice.id, invoice.sequence)}
            <span
              className={`badge ${STATUS_BADGE[invoice.status] ?? "badge-neutral"}`}
            >
              {STATUS_LABEL[invoice.status] ?? invoice.status}
            </span>
            {invoice.sequence > 0 && (
              <span
                className="badge badge-info"
                title="Veces que se ha editado en borrador"
              >
                Versión {invoice.sequence}
              </span>
            )}
          </h1>
          <p className="page-sub">
            {invoice.ncf
              ? `NCF: ${invoice.ncf}`
              : "Borrador — NCF pendiente de asignación"}
          </p>
        </div>
      </div>

      {invoice.status === "cancelled" && invoice.cancellationReason && (
        <div
          className="inline-alert inline-alert-error"
          style={{ marginBottom: 16 }}
        >
          <XCircle size={16} />
          <span>
            Cancelada por{" "}
            <strong>{invoice.cancelledBy ?? "usuario desconocido"}</strong>
            {invoice.cancelledAt
              ? ` el ${formatDateTime(invoice.cancelledAt)}`
              : ""}
            : {invoice.cancellationReason}
          </span>
        </div>
      )}

      <div className="doc-actions-bar">
        {invoice.status === "draft" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              width: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn btn-danger btn-size-sm"
                onClick={openCancelModal}
                disabled={isActionsLoading}
              >
                <Ban size={14} /> Cancelar
              </button>

              {!noCredit && !paidByCreditNote && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={payCash}
                    onChange={(e) => setPayCash(e.target.checked)}
                  />
                  Cobrar al contado
                </label>
              )}

              {(paidByCreditNote || flujoCobro !== "caja" || !showCashSelector) && (
                <div>
                  {paidByCreditNote ? (
                    <SearchSelect
                      value={CREDIT_NOTE_MODE_OF_PAYMENT}
                      selectedLabel={CREDIT_NOTE_MODE_OF_PAYMENT}
                      onChange={() => {}}
                      options={[]}
                      onSearch={() => {}}
                      disabled
                      className="ff-select"
                    />
                  ) : (
                    showCashSelector && (
                      <SearchSelect
                        value={modeOfPayment}
                        selectedLabel={
                          metodos?.find((m) => m.name === modeOfPayment)?.name ??
                          ""
                        }
                        onChange={(val) => setModeOfPayment(val)}
                        options={metodosOptions}
                        onSearch={setModeOfPaymentSearch}
                        placeholder="Método de pago…"
                        className="ff-select"
                      />
                    )
                  )}
                </div>
              )}

              {!(flujoCobro === "caja" && showCashSelector && !paidByCreditNote) && (
                <button
                  className="btn btn-primary btn-size-sm"
                  onClick={handleSubmitClick}
                  disabled={isActionsLoading}
                >
                  <Send size={14} /> Someter
                </button>
              )}
            </div>

            {flujoCobro === "caja" && showCashSelector && !paidByCreditNote && (
              <>
                <PaymentLinesEditor
                  amountDue={pendingAmount}
                  value={cashPayments}
                  onChange={setCashPayments}
                />
                <button
                  className="btn btn-primary btn-size-sm"
                  style={{ alignSelf: "flex-start" }}
                  onClick={handleSubmitClick}
                  disabled={isActionsLoading || !isCashReadyToSubmit()}
                >
                  <Send size={14} /> Someter
                </button>
              </>
            )}
            {noCredit && !paidByCreditNote && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  margin: 0,
                }}
              >
                <AlertTriangle size={12} /> Este cliente no tiene crédito
                habilitado — se cobrará al contado.
              </p>
            )}
            {paidByCreditNote && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  margin: 0,
                }}
              >
                <Wallet size={12} /> Cubierta al 100% por saldo a favor / nota
                de crédito aplicada — se someterá sin cobro adicional.
              </p>
            )}
          </div>
        )}
        {invoice.status === "submitted" && (
          <>
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending}
            >
              {downloadMutation.isPending ? (
                <>
                  <span className="spinner" /> Descargando…
                </>
              ) : (
                <>
                  <Download size={14} /> Descargar PDF
                </>
              )}
            </button>
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={openReturnModal}
              disabled={isActionsLoading}
            >
              <RotateCcw size={14} /> Devolver producto(s)
            </button>
            <button
              className="btn btn-danger btn-size-sm"
              onClick={openCancelModal}
              disabled={isActionsLoading}
            >
              <XCircle size={14} /> Cancelar
            </button>
          </>
        )}
        {invoice.status === "cancelled" && (
          <button
            className="btn btn-secondary btn-size-sm"
            onClick={() => amendMutation.mutate()}
            disabled={isActionsLoading}
          >
            <FileEdit size={14} /> Enmendar
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Información de la Factura</h2>
        </div>
        <div
          className="card-body"
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">{invoice.customerName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">
                {formatDate(invoice.postingDate)}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Vencimiento</span>
              <span className="detail-value">
                {formatDate(invoice.dueDate)}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">NCF</span>
              <span
                className="detail-value"
                style={{ fontFamily: "monospace", fontWeight: 600 }}
              >
                {invoice.ncf ?? (
                  <em
                    style={{
                      fontStyle: "italic",
                      fontWeight: 400,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Pendiente
                  </em>
                )}
              </span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo NCF</span>
              <span className="detail-value">
                {ncfLabel ? (
                  <span className="badge badge-neutral">{ncfLabel}</span>
                ) : (
                  "—"
                )}
              </span>
            </div>
            {invoice.amendedFrom && (
              <div className="detail-field">
                <span className="detail-label">Enmienda de</span>
                <button
                  style={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    color: "var(--color-brand)",
                    textDecoration: "underline",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  onClick={() =>
                    navigate(`/facturas/${invoice.amendedFrom}`)
                  }
                >
                  {invoice.amendedFrom}
                </button>
              </div>
            )}
          </div>

          {invoice.status === "submitted" && (
            <div
              style={{
                paddingTop: 16,
                borderTop: "1px solid var(--border)",
                display: "flex",
                flexWrap: "wrap",
                gap: 24,
              }}
            >
              <div className="detail-field">
                <span className="detail-label">Pendiente</span>
                <span
                  className="detail-value"
                  style={{ fontWeight: 700, color: outstandingColor }}
                >
                  {formatDOP(invoice.outstandingAmount)}
                </span>
              </div>
              {ps && (
                <div className="detail-field">
                  <span className="detail-label">Estado de Pago</span>
                  <span className="detail-value">
                    <span
                      className={`badge ${PAYMENT_BADGE[ps] ?? "badge-neutral"}`}
                    >
                      {PAYMENT_LABEL[ps] ?? ps}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}

          {invoice.status === "submitted" && (invoice.paymentLines?.length ?? 0) > 0 && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                Pagos
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Método</th>
                      <th style={{ textAlign: "right" }}>Monto</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.paymentLines!.map((p, i) => (
                      <tr key={i}>
                        <td>{p.modeOfPayment}</td>
                        <td style={{ textAlign: "right" }}>{formatDOP(p.amount)}</td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {[
                            p.cardNumber && `Tarjeta: ${p.cardNumber}`,
                            p.authorizationCode && `Autorización: ${p.authorizationCode}`,
                            p.bank && `Banco: ${p.bank}`,
                            p.checkNumber && `Cheque: ${p.checkNumber}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {invoice.status === "submitted" && (invoice.vueltoDetalle?.length ?? 0) > 0 && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                Vuelto entregado
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Denominación</th>
                      <th style={{ textAlign: "right" }}>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.vueltoDetalle!.map((v, i) => (
                      <tr key={i}>
                        <td>{v.denominacion}</td>
                        <td style={{ textAlign: "right" }}>{v.cantidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {invoice.notes && (
            <div
              style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}
            >
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                Notas
              </p>
              <p style={{ fontSize: 13, whiteSpace: "pre-line" }}>
                {invoice.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {invoice.status === "draft" && saldoFavor && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h2
              className="card-title"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Wallet size={16} /> Aplicar saldo a favor disponible
            </h2>
            {saldoFavor.entries.length && (
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Total disponible: {formatDOP(saldoFavor.balance)}
              </span>
            )}
          </div>
          {!saldoFavor.entries.length ? (
            <div className="card-body">
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  margin: 0,
                }}
              >
                Este cliente no tiene saldo a favor disponible.
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Origen</th>
                    <th>Fecha</th>
                    <th>Método</th>
                    <th style={{ textAlign: "right" }}>Disponible</th>
                    <th style={{ textAlign: "right" }}>Comprometido</th>
                    <th style={{ textAlign: "right" }}>Disponible neto</th>
                    <th style={{ textAlign: "right", width: 140 }}>
                      Monto a aplicar
                    </th>
                    <th style={{ width: 140 }} />
                  </tr>
                </thead>
                <tbody>
                  {saldoFavor.entries.map((entry) => {
                    const defaultAmount = Math.min(
                      entry.availableAmount,
                      pendingAmount || entry.availableAmount,
                    );
                    const fullyCommitted = entry.availableAmount <= 0.01;
                    const appliedToThisInvoice = entry.appliedTo?.find(
                      (a) => a.invoiceId === id,
                    );
                    return (
                      <tr key={entry.paymentEntryId}>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                          {entry.paymentEntryId}
                        </td>
                        <td>{formatDate(entry.postingDate)}</td>
                        <td>{entry.modeOfPayment}</td>
                        <td style={{ textAlign: "right" }}>
                          {formatDOP(entry.unallocatedAmount)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {formatDOP(entry.committedAmount)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {formatDOP(entry.availableAmount)}
                        </td>
                        <td>
                          {!fullyCommitted && (
                            <input
                              className="items-input"
                              type="number"
                              min="0.01"
                              max={entry.availableAmount}
                              step="0.01"
                              style={{ textAlign: "right" }}
                              value={
                                saldoAmounts[entry.paymentEntryId] ??
                                defaultAmount
                              }
                              onChange={(e) =>
                                setSaldoAmounts((prev) => ({
                                  ...prev,
                                  [entry.paymentEntryId]:
                                    parseFloat(e.target.value) || 0,
                                }))
                              }
                            />
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              gap: 4,
                            }}
                          >
                            {fullyCommitted && (
                              <span
                                className="badge badge-neutral"
                                style={{ whiteSpace: "nowrap" }}
                              >
                                100% comprometido
                              </span>
                            )}
                            {!fullyCommitted && (
                              <button
                                className="btn btn-secondary btn-size-sm"
                                disabled={applySaldoMutation.isPending}
                                onClick={() => {
                                  const amount =
                                    saldoAmounts[entry.paymentEntryId] ??
                                    defaultAmount;
                                  if (
                                    !amount ||
                                    amount <= 0 ||
                                    amount > entry.availableAmount
                                  ) {
                                    toast.error(
                                      "El monto debe ser mayor a 0 y no exceder el saldo disponible",
                                    );
                                    return;
                                  }
                                  applySaldoMutation.mutate({
                                    paymentEntryId: entry.paymentEntryId,
                                    amount,
                                  });
                                }}
                              >
                                Aplicar
                              </button>
                            )}
                            {appliedToThisInvoice && (
                              <button
                                className="btn btn-ghost btn-size-sm"
                                style={{
                                  color:
                                    "var(--color-error, var(--error-text))",
                                }}
                                disabled={removeSaldoMutation.isPending}
                                onClick={() =>
                                  removeSaldoMutation.mutate(
                                    entry.paymentEntryId,
                                  )
                                }
                                title={`Aplicado a esta factura: ${formatDOP(appliedToThisInvoice.allocatedAmount)}`}
                              >
                                Deshacer
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {invoice.status === "draft" && creditNoteSaldo && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h2
              className="card-title"
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Receipt size={16} /> Notas de crédito
            </h2>
            {creditNoteSaldo.balance > 0 && (
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Total disponible: {formatDOP(creditNoteSaldo.balance)}
              </span>
            )}
          </div>
          {creditNoteSaldo.entries.length === 0 ? (
            <div className="card-body">
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  margin: 0,
                }}
              >
                Este cliente no tiene notas de crédito disponibles.
              </p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>NCF</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th style={{ textAlign: "right" }}>Reembolsado</th>
                    <th style={{ textAlign: "right" }}>Aplicado</th>
                    <th style={{ textAlign: "right" }}>Disponible</th>
                    <th style={{ textAlign: "right", width: 140 }}>
                      Monto a aplicar
                    </th>
                    <th style={{ width: 140 }} />
                  </tr>
                </thead>
                <tbody>
                  {creditNoteSaldo.entries.map((entry) => {
                    const defaultAmount = Math.min(
                      entry.availableAmount,
                      pendingAmount || entry.availableAmount,
                    );
                    const fullyUsed = entry.availableAmount <= 0.01;
                    const appliedToThisInvoice = entry.appliedTo?.find(
                      (a) => a.invoiceId === id,
                    );
                    return (
                      <tr key={entry.creditNoteId}>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                          {entry.ncf ?? entry.creditNoteId}
                        </td>
                        <td>{formatDate(entry.postingDate)}</td>
                        <td style={{ textAlign: "right" }}>
                          {formatDOP(entry.grandTotal)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {formatDOP(entry.refundedAmount)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {formatDOP(entry.appliedAmount)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {formatDOP(entry.availableAmount)}
                        </td>
                        <td>
                          {!fullyUsed && !appliedToThisInvoice && (
                            <input
                              className="items-input"
                              type="number"
                              min="0.01"
                              max={entry.availableAmount}
                              step="0.01"
                              style={{ textAlign: "right" }}
                              value={
                                creditNoteAmounts[entry.creditNoteId] ??
                                defaultAmount
                              }
                              onChange={(e) =>
                                setCreditNoteAmounts((prev) => ({
                                  ...prev,
                                  [entry.creditNoteId]:
                                    parseFloat(e.target.value) || 0,
                                }))
                              }
                            />
                          )}
                        </td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              gap: 4,
                            }}
                          >
                            {fullyUsed && !appliedToThisInvoice && (
                              <span
                                className="badge badge-neutral"
                                style={{ whiteSpace: "nowrap" }}
                              >
                                Agotada
                              </span>
                            )}
                            {!fullyUsed && !appliedToThisInvoice && (
                              <button
                                className="btn btn-secondary btn-size-sm"
                                disabled={applyCreditNoteMutation.isPending}
                                onClick={() => {
                                  const amount =
                                    creditNoteAmounts[entry.creditNoteId] ??
                                    defaultAmount;
                                  if (
                                    !amount ||
                                    amount <= 0 ||
                                    amount > entry.availableAmount
                                  ) {
                                    toast.error(
                                      "El monto debe ser mayor a 0 y no exceder el saldo disponible",
                                    );
                                    return;
                                  }
                                  applyCreditNoteMutation.mutate({
                                    creditNoteId: entry.creditNoteId,
                                    amount,
                                  });
                                }}
                              >
                                Aplicar
                              </button>
                            )}
                            {appliedToThisInvoice && (
                              <>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "var(--text-secondary)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Aplicado:{" "}
                                  {formatDOP(appliedToThisInvoice.amount)}
                                </span>
                                <span
                                  className={`badge ${appliedToThisInvoice.status === "reconciled" ? "badge-success" : "badge-warning"}`}
                                  style={{ whiteSpace: "nowrap" }}
                                >
                                  {appliedToThisInvoice.status === "reconciled"
                                    ? "Reconciliada"
                                    : "Pendiente"}
                                </span>
                                {appliedToThisInvoice.status === "pending" && (
                                  <button
                                    className="btn btn-ghost btn-size-sm"
                                    style={{
                                      color:
                                        "var(--color-error, var(--error-text))",
                                    }}
                                    disabled={
                                      removeCreditNoteMutation.isPending
                                    }
                                    onClick={() =>
                                      removeCreditNoteMutation.mutate(
                                        entry.creditNoteId,
                                      )
                                    }
                                    title="Deshacer aplicación — para cambiar el monto, deshaz y vuelve a aplicar"
                                  >
                                    Quitar
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {invoice.status === "submitted" &&
        invoice.outstandingAmount > 0 &&
        saldoFavor &&
        saldoFavor.balance > 0 && (
          <div
            className="inline-alert"
            style={{
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Wallet size={16} />
            <span>
              Este cliente tiene {formatDOP(saldoFavor.balance)} de saldo a
              favor disponible, pero solo se puede aplicar a facturas en
              borrador. Esta funcionalidad para facturas sometidas aún no está
              disponible.
            </span>
          </div>
        )}

      {invoice.status === "submitted" &&
        invoice.outstandingAmount > 0 &&
        creditNoteSaldo &&
        creditNoteSaldo.balance > 0 && (
          <div
            className="inline-alert"
            style={{
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Receipt size={16} />
            <span>
              Este cliente tiene {formatDOP(creditNoteSaldo.balance)} en notas
              de crédito disponibles, pero solo se pueden aplicar a facturas en
              borrador. Esta funcionalidad para facturas sometidas aún no está
              disponible.
            </span>
          </div>
        )}

      {invoice.status === "draft" &&
        invoice.pendingTracking &&
        invoice.pendingTracking.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2
                className="modal-title"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                <AlertTriangle
                  size={16}
                  style={{ color: "var(--color-warning)" }}
                />{" "}
                Pendiente de asignar serial/lote
              </h2>
              <button
                className="btn btn-primary btn-size-sm"
                onClick={() => setPendingTrackingModalOpen(true)}
              >
                Asignar seriales/lotes
              </button>
            </div>
            <div
              className="card-body"
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <p
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  margin: 0,
                }}
              >
                Estos artículos requieren tracking de serial/lote. ERPNext lo
                asigna automáticamente al someter si hay stock disponible —
                usa este selector solo si quieres elegir uno específico, o si
                el submit falla por falta de stock.
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Almacén</th>
                    <th style={{ textAlign: "right" }}>Cant.</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.pendingTracking.map((p, i) => (
                    <tr key={i}>
                      <td>
                        {p.itemCode}
                        {p.parentItem && (
                          <span
                            className="td-muted"
                            style={{ display: "block", fontSize: 12 }}
                          >
                            Componente del combo {p.parentItem}
                          </span>
                        )}
                      </td>
                      <td className="td-muted">{p.warehouse}</td>
                      <td style={{ textAlign: "right" }}>{p.qty}</td>
                      <td className="td-muted">
                        {p.trackingType === "serial" ? "Serial" : "Lote"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Artículos</h2>
        </div>
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Notas</th>
                <th style={{ textAlign: "right" }}>Cant.</th>
                <th style={{ textAlign: "right" }}>Precio Unit.</th>
                <th style={{ textAlign: "right", width: 72 }}>Dto. %</th>
                <th style={{ textAlign: "right" }}>Importe</th>
                <th>UDM</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {item.itemCode || "—"}
                  </td>
                  <td>{item.description || "—"}</td>
                  <td
                    style={{
                      fontSize: 12,
                      color: "var(--text-tertiary)",
                      maxWidth: 160,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={item.notes ?? ""}
                  >
                    {item.notes ?? "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>{item.qty}</td>
                  <td style={{ textAlign: "right" }}>
                    {item.discountPct && item.discountPct > 0 ? (
                      <>
                        <span
                          style={{
                            textDecoration: "line-through",
                            color: "var(--text-tertiary)",
                            marginRight: 4,
                          }}
                        >
                          {formatDOP(item.rate)}
                        </span>
                        {formatDOP(item.discountedRate ?? item.rate)}
                      </>
                    ) : (
                      formatDOP(item.rate)
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {item.discountPct ? `${item.discountPct}%` : "—"}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 500 }}>
                    {formatDOP(item.amount)}
                  </td>
                  <td>{item.uom || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="items-total-row">
            {(() => {
              const gross = invoice.items.reduce(
                (s, i) => s + i.qty * i.rate,
                0,
              );
              const discount = gross - invoice.subtotal;
              return (
                <>
                  <div className="items-total-line">
                    <span>Subtotal bruto</span>
                    <span>{formatDOP(gross)}</span>
                  </div>
                  {discount > 0 && (
                    <div
                      className="items-total-line"
                      style={{ color: "var(--text-danger)" }}
                    >
                      <span>Descuento total</span>
                      <span>-{formatDOP(discount)}</span>
                    </div>
                  )}
                </>
              );
            })()}
            <div className="items-total-line">
              <span>Impuestos</span>
              <span>{formatDOP(invoice.grandTotal - invoice.subtotal)}</span>
            </div>
            {creditoAplicado > 0 && (
              <div
                className="items-total-line"
                style={{ color: "var(--color-success)" }}
              >
                <span>Crédito</span>
                <span>-{formatDOP(creditoAplicado)}</span>
              </div>
            )}
            <div
              className="items-total-line"
              style={{ fontWeight: 700, fontSize: 15 }}
            >
              <span>Total</span>
              <span>{formatDOP(invoice.grandTotal)}</span>
            </div>
            {creditoAplicado > 0 && (
              <div
                className="items-total-line"
                style={{ fontWeight: 700, fontSize: 15 }}
              >
                <span>Total después de crédito</span>
                <span>{formatDOP(invoice.grandTotal - creditoAplicado)}</span>
              </div>
            )}
            {invoice.status === "submitted" && (
              <div
                className="items-total-line"
                style={{ color: outstandingColor, fontWeight: 600 }}
              >
                <span>Pendiente</span>
                <span>{formatDOP(invoice.outstandingAmount)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Historial */}
      <DocumentHistoryCard
        history={invoice.history}
        basePath="/facturas"
        currentDocId={invoice.id}
      />

      {/* Modal: buscando a qué línea/almacén pertenece el artículo del error de tracking */}
      {trackingRecoveryLoading && (
        <div className="modal-overlay">
          <div
            className="modal-box modal-box-sm"
            style={{ textAlign: "center", padding: 32 }}
          >
            <Loader2 size={20} className="spin" />
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 12 }}>
              Buscando información del artículo…
            </p>
          </div>
        </div>
      )}

      {/* Modal: asignar serial/lote para recuperar el submit fallido */}
      {trackingRecovery && (
        <ComponentTrackingModal
          bundleName={trackingRecovery.itemName ?? trackingRecovery.itemCode}
          components={[trackingRecovery]}
          title={`Serial / Lote requerido — ${trackingRecovery.itemName ?? trackingRecovery.itemCode}`}
          description="ERPNext no pudo asignar automáticamente el serial/lote de este artículo (sin stock disponible en el almacén de la línea, o requiere selección manual). Elige uno para continuar."
          confirmLabel={assignTrackingRecoveryMutation.isPending ? "Asignando…" : "Asignar y reintentar"}
          onConfirm={(tracking) => assignTrackingRecoveryMutation.mutate(tracking)}
          onClose={() => setTrackingRecovery(null)}
        />
      )}

      {/* Modal: asignación proactiva desde la sección "Pendiente de asignar serial/lote" */}
      {pendingTrackingModalOpen && invoice.pendingTracking && (
        <ComponentTrackingModal
          bundleName="Factura"
          components={invoice.pendingTracking.map((p) => ({
            itemCode: p.itemCode,
            itemName: p.parentItem
              ? `${p.itemCode} — Componente del combo ${p.parentItem}`
              : p.itemCode,
            trackingType: p.trackingType,
            qtyNeeded: p.qty,
            warehouse: p.warehouse,
          }))}
          title="Asignar seriales/lotes pendientes"
          description="Selecciona los seriales/lotes de cada artículo pendiente. No es obligatorio para someter la factura — ERPNext los asigna automáticamente si hay stock disponible."
          confirmLabel={
            assignPendingTrackingMutation.isPending
              ? "Guardando…"
              : "Guardar asignación"
          }
          onConfirm={(tracking) => assignPendingTrackingMutation.mutate(tracking)}
          onClose={() => setPendingTrackingModalOpen(false)}
        />
      )}

      {/* Modal: crédito excedido al someter */}
      {creditErrorOpen && (
        <div
          className="modal-overlay"
          onClick={() => setCreditErrorOpen(false)}
        >
          <div
            className={flujoCobro === "caja" ? "modal-box" : "modal-box modal-box-sm"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2
                className="modal-title"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <AlertTriangle
                  size={16}
                  style={{ color: "var(--error-text)" }}
                />{" "}
                Crédito excedido
              </h2>
              <button
                className="modal-close"
                onClick={() => setCreditErrorOpen(false)}
              >
                ×
              </button>
            </div>
            <div
              className="modal-body"
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {creditErrorMsg}
              </p>
              {flujoCobro === "caja" ? (
                <PaymentLinesEditor
                  amountDue={pendingAmount}
                  value={cashPayments}
                  onChange={setCashPayments}
                />
              ) : (
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="modeOfPaymentRetry">
                    Método de pago <span className="ff-required">*</span>
                  </label>
                  <SearchSelect
                    id="modeOfPaymentRetry"
                    value={modeOfPayment}
                    selectedLabel={
                      metodos?.find((m) => m.name === modeOfPayment)?.name ?? ""
                    }
                    onChange={(val) => setModeOfPayment(val)}
                    options={metodosRetryOptions}
                    onSearch={setModeOfPaymentRetrySearch}
                    placeholder="Seleccionar…"
                    className="ff-select"
                  />
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-secondary"
                onClick={() => setCreditErrorOpen(false)}
              >
                Volver
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCashRetry}
                disabled={submitMutation.isPending || !isCashReadyToSubmit()}
              >
                <Send size={14} /> Cobrar al contado y someter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cancelar factura con motivo obligatorio */}
      {cancelModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setCancelModalOpen(false)}
        >
          <div
            className="modal-box modal-box-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2
                className="modal-title"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Ban size={16} style={{ color: "var(--error-text)" }} />{" "}
                Cancelar factura
              </h2>
              <button
                className="modal-close"
                onClick={() => setCancelModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div
              className="modal-body"
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              {cancelForbiddenMsg && (
                <div className="inline-alert inline-alert-warn">
                  <AlertTriangle size={16} />
                  <span>{cancelForbiddenMsg}</span>
                </div>
              )}
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="cancelReason">
                  Motivo de cancelación
                </label>
                <textarea
                  id="cancelReason"
                  className="ff-textarea"
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Describe el motivo de la cancelación (mínimo 10 caracteres)"
                  maxLength={500}
                />
                <p className="ff-hint">
                  {cancelReason.trim().length}/500 caracteres (mínimo 10)
                </p>
              </div>
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-secondary"
                onClick={() => setCancelModalOpen(false)}
              >
                Volver
              </button>
              <button
                className="btn btn-danger"
                onClick={() => cancelMutation.mutate(cancelReason.trim())}
                disabled={!cancelReasonValid || cancelMutation.isPending}
              >
                <Ban size={14} /> Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: devolver producto(s) */}
      {returnModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setReturnModalOpen(false)}
        >
          <div
            className="modal-box modal-box-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "90vh", overflowY: "auto" }}
          >
            <div className="modal-head">
              <h2
                className="modal-title"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <RotateCcw size={16} /> Devolver producto(s)
              </h2>
              <button
                className="modal-close"
                onClick={() => setReturnModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div
              className="modal-body"
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={returnFullInvoice}
                  onChange={(e) => setReturnFullInvoice(e.target.checked)}
                />
                Devolver la factura completa
              </label>

              {!returnFullInvoice && (
                <div className="items-table-wrap">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        <th>Artículo</th>
                        <th style={{ textAlign: "right", width: 100 }}>
                          Comprado
                        </th>
                        <th style={{ textAlign: "right", width: 120 }}>
                          Cant. a devolver
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {returnRows.map((row) => (
                        <tr
                          key={row.itemCode}
                          style={{ opacity: row.checked ? 1 : 0.6 }}
                        >
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={row.checked}
                              onChange={() => toggleReturnRow(row.itemCode)}
                              style={{
                                cursor: "pointer",
                                accentColor: "var(--color-brand)",
                              }}
                            />
                          </td>
                          <td>
                            <span style={{ fontWeight: 500 }}>
                              {row.description}
                            </span>
                            <br />
                            <span
                              style={{
                                fontSize: 11,
                                fontFamily: "monospace",
                                color: "var(--text-tertiary)",
                              }}
                            >
                              {row.itemCode}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {row.qtyPurchased}
                          </td>
                          <td>
                            <input
                              className={`items-input${row.checked && (row.qty <= 0 || row.qty > row.qtyPurchased) ? " items-input-error" : ""}`}
                              type="number"
                              min="0"
                              max={row.qtyPurchased}
                              step="1"
                              style={{ textAlign: "right" }}
                              value={row.qty}
                              disabled={!row.checked}
                              onChange={(e) =>
                                setReturnRowQty(
                                  row.itemCode,
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="ff-wrap">
                <label className="ff-label ff-required">
                  ¿Qué hacer con el monto?
                </label>
                <SearchSelect
                  value={returnResolution}
                  selectedLabel={
                    RETURN_RESOLUTION_OPTIONS.find(
                      (o) => o.value === returnResolution,
                    )?.label ?? ""
                  }
                  onChange={(val) =>
                    setReturnResolution(
                      (val || "credit_note_only") as
                        | "refund"
                        | "credit_note_only",
                    )
                  }
                  options={returnResolutionOptions}
                  onSearch={setReturnResolutionSearch}
                  className="ff-select"
                />
                {hasOutstandingBalance && (
                  <p className="ff-hint">
                    Esta factura tiene {formatDOP(invoice.outstandingAmount)}{" "}
                    pendiente de cobro — la nota de crédito se aplicará
                    automáticamente a ese pendiente, por eso "Reembolsar
                    ahora" no está disponible.
                  </p>
                )}
              </div>

              {returnResolution === "refund" && (
                <div className="ff-wrap">
                  <label
                    className="ff-label ff-required"
                    htmlFor="returnModeOfPayment"
                  >
                    Método de pago del reembolso
                  </label>
                  <SearchSelect
                    id="returnModeOfPayment"
                    value={returnModeOfPayment}
                    selectedLabel={
                      metodos?.find((m) => m.name === returnModeOfPayment)
                        ?.name ?? ""
                    }
                    onChange={(val) => setReturnModeOfPayment(val)}
                    options={returnModeOptions}
                    onSearch={setReturnModeOfPaymentSearch}
                    placeholder="Seleccionar…"
                    className="ff-select"
                  />
                </div>
              )}

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="returnReason">
                  Motivo de la devolución
                </label>
                <textarea
                  id="returnReason"
                  className="ff-textarea"
                  rows={3}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Describe el motivo de la devolución (mínimo 10 caracteres)"
                  maxLength={500}
                />
                <p className="ff-hint">
                  {returnReason.trim().length}/500 caracteres (mínimo 10)
                </p>
              </div>
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-secondary"
                onClick={() => setReturnModalOpen(false)}
              >
                Volver
              </button>
              <button
                className="btn btn-primary"
                onClick={() => devolucionMutation.mutate()}
                disabled={!canConfirmReturn || devolucionMutation.isPending}
              >
                {devolucionMutation.isPending && <span className="spinner" />}
                <RotateCcw size={14} /> Confirmar devolución
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
