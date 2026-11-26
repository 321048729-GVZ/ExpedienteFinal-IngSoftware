import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

function mensajeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error interno del servidor";
}

function fechaLocal(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(request.url);

    const hoy = fechaLocal();
    let fecha_inicio = (searchParams.get("fecha_inicio") ?? "").trim();
    let fecha_fin = (searchParams.get("fecha_fin") ?? "").trim();

    if (!fecha_inicio && !fecha_fin) {
      fecha_inicio = hoy;
      fecha_fin = hoy;
    } else if (!fecha_inicio) {
      fecha_inicio = fecha_fin;
    } else if (!fecha_fin) {
      fecha_fin = fecha_inicio;
    }

    if (fecha_inicio > fecha_fin) {
      [fecha_inicio, fecha_fin] = [fecha_fin, fecha_inicio];
    }

    const { data: ventas, error: ventasError } = await supabase
      .from("ventas")
      .select("folio_venta, fecha, total_venta, metodo_pago")
      .gte("fecha", fecha_inicio)
      .lte("fecha", fecha_fin)
      .order("fecha", { ascending: false });

    if (ventasError) {
      return NextResponse.json({ error: ventasError.message }, { status: 500 });
    }

    const ventasPeriodo = ventas ?? [];
    const folios = ventasPeriodo
      .map((venta) => String(venta.folio_venta ?? ""))
      .filter((folio) => folio.length > 0);

    let detalleVenta: Array<{ folio_venta: string; id_producto: number | null; cantidad: number }> = [];

    if (folios.length > 0) {
      const { data, error } = await supabase
        .from("detalle_venta")
        .select("folio_venta, id_producto, cantidad")
        .in("folio_venta", folios);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      detalleVenta = (data ?? []).map((item) => ({
        folio_venta: String(item.folio_venta ?? ""),
        id_producto: item.id_producto === null ? null : Number(item.id_producto),
        cantidad: Number(item.cantidad ?? 0),
      }));
    }

    const idsProducto = Array.from(
      new Set(
        detalleVenta
          .map((item) => item.id_producto)
          .filter((id): id is number => id !== null && Number.isInteger(id))
      )
    );

    const costosPorProducto = new Map<number, number>();

    if (idsProducto.length > 0) {
      const { data, error } = await supabase
        .from("detalle_compra")
        .select("id_producto, costo_unitario, id_detalle_compra")
        .in("id_producto", idsProducto)
        .order("id_detalle_compra", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      for (const compra of data ?? []) {
        const id = Number(compra.id_producto);
        if (!costosPorProducto.has(id)) {
          costosPorProducto.set(id, Number(compra.costo_unitario ?? 0));
        }
      }
    }

    const { data: productos, error: productosError } = await supabase
      .from("productos")
      .select("id_producto, nombre_producto, precio, stock, estado_producto")
      .order("id_producto", { ascending: true });

    if (productosError) {
      return NextResponse.json({ error: productosError.message }, { status: 500 });
    }

    const ventas_totales = redondear(
      ventasPeriodo.reduce((total, venta) => total + Number(venta.total_venta ?? 0), 0)
    );

    const numero_ventas = ventasPeriodo.length;
    const ticket_promedio = numero_ventas > 0 ? redondear(ventas_totales / numero_ventas) : 0;

    const costo_productos_vendidos = redondear(
      detalleVenta.reduce((total, item) => {
        const costo = item.id_producto !== null
          ? costosPorProducto.get(item.id_producto) ?? 0
          : 0;
        return total + item.cantidad * costo;
      }, 0)
    );

    const utilidades = redondear(ventas_totales - costo_productos_vendidos);

    const alertas_stock = (productos ?? [])
      .filter((producto) => {
        const stock = Number(producto.stock ?? 0);
        return producto.estado_producto === "agotado" || stock <= 5;
      })
      .map((producto) => ({
        id_producto: Number(producto.id_producto),
        nombre_producto: String(producto.nombre_producto ?? ""),
        estado: String(producto.estado_producto ?? ""),
        stock: Number(producto.stock ?? 0),
        precio: Number(producto.precio ?? 0),
      }))
      .sort((a, b) => a.stock - b.stock);

    return NextResponse.json(
      {
        fecha_inicio,
        fecha_fin,
        ventas_totales,
        total_ventas: ventas_totales,
        numero_ventas,
        ticket_promedio,
        costo_productos_vendidos,
        utilidades,
        alertas_stock,
        ventas_periodo: ventasPeriodo.map((venta) => ({
          folio_venta: String(venta.folio_venta ?? ""),
          fecha: String(venta.fecha ?? ""),
          total_venta: Number(venta.total_venta ?? 0),
          metodo_pago: String(venta.metodo_pago ?? ""),
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
