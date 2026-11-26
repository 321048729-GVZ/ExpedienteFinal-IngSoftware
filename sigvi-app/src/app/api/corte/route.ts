import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

function mensajeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error interno del servidor";
}

function fechaLocal(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const fechaActual = fechaLocal();

    const { data: ventasDia, error: ventasError } = await supabase
      .from("ventas")
      .select("total_venta, metodo_pago")
      .eq("fecha", fechaActual);

    if (ventasError) {
      return NextResponse.json({ error: ventasError.message }, { status: 500 });
    }

    const { data: comprasDia, error: comprasError } = await supabase
      .from("compras")
      .select("total_compra")
      .eq("fecha", fechaActual);

    if (comprasError) {
      return NextResponse.json({ error: comprasError.message }, { status: 500 });
    }

    const total_ventas_dia = (ventasDia ?? []).reduce(
      (total, venta) => total + Number(venta.total_venta ?? 0),
      0
    );

    const total_compras_dia = (comprasDia ?? []).reduce(
      (total, compra) => total + Number(compra.total_compra ?? 0),
      0
    );

    const balance_caja = total_ventas_dia - total_compras_dia;

    const desglosePago: Record<"efectivo" | "tarjeta" | "transferencia", number> = {
      efectivo: 0,
      tarjeta: 0,
      transferencia: 0,
    };

    for (const venta of ventasDia ?? []) {
      const metodo = String(venta.metodo_pago ?? "") as keyof typeof desglosePago;
      if (metodo in desglosePago) {
        desglosePago[metodo] += Number(venta.total_venta ?? 0);
      }
    }

    return NextResponse.json(
      {
        fecha: fechaActual,
        total_ventas_dia,
        total_compras_dia,
        balance_caja,
        desglosePago,
        desglose_metodo_pago: desglosePago,
        numero_ventas: ventasDia?.length ?? 0,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
