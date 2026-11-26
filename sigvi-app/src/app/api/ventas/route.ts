import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

const METODOS_PAGO = new Set(["efectivo", "tarjeta", "transferencia"]);

function mensajeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error interno del servidor";
}

function fechaLocal(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function horaLocal(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(11, 19);
}

function siguienteFolio(folios: Array<{ folio_venta: string }> | null, prefijo: string): string {
  let maximo = 0;

  for (const fila of folios ?? []) {
    const coincidencia = String(fila.folio_venta ?? "").match(/(\d+)$/);
    if (coincidencia) {
      const numero = Number(coincidencia[1]);
      if (Number.isFinite(numero) && numero > maximo) maximo = numero;
    }
  }

  return `${prefijo}-${String(maximo + 1).padStart(3, "0")}`;
}

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("ventas")
      .select("*")
      .order("fecha", { ascending: false })
      .order("hora", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? [], { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const body = (await request.json().catch(() => null)) as
      | {
          productos?: unknown;
          cantidades?: unknown;
          metodo_pago?: unknown;
          metodoPago?: unknown;
        }
      | null;

    if (!body) {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
    }

    const productosRaw = Array.isArray(body.productos) ? body.productos : null;
    const cantidadesRaw = Array.isArray(body.cantidades) ? body.cantidades : null;
    const metodo_pago = String(body.metodo_pago ?? body.metodoPago ?? "").toLowerCase();

    if (!productosRaw || !cantidadesRaw) {
      return NextResponse.json(
        { error: "Los campos productos y cantidades son obligatorios" },
        { status: 400 }
      );
    }

    if (productosRaw.length !== cantidadesRaw.length) {
      return NextResponse.json(
        { error: "La cantidad de productos y cantidades no coincide" },
        { status: 400 }
      );
    }

    if (productosRaw.length === 0) {
      return NextResponse.json({ error: "La venta no contiene productos" }, { status: 400 });
    }

    if (!METODOS_PAGO.has(metodo_pago)) {
      return NextResponse.json(
        { error: "Método de pago inválido. Usa efectivo, tarjeta o transferencia" },
        { status: 400 }
      );
    }

    const solicitados = new Map<number, number>();

    for (let i = 0; i < productosRaw.length; i++) {
      const id = Number(productosRaw[i]);
      const cantidad = Number(cantidadesRaw[i]);

      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ error: "id_producto inválido" }, { status: 400 });
      }

      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        return NextResponse.json({ error: "La cantidad debe ser un entero mayor a 0" }, { status: 400 });
      }

      solicitados.set(id, (solicitados.get(id) ?? 0) + cantidad);
    }

    const ids = Array.from(solicitados.keys());

    // === Rama Aferente: obtener_datos_venta ===
    const { data: productosData, error: productosError } = await supabase
      .from("productos")
      .select("*")
      .in("id_producto", ids);

    if (productosError) {
      return NextResponse.json({ error: productosError.message }, { status: 500 });
    }

    const productosPorId = new Map<number, Record<string, unknown>>();
    for (const producto of productosData ?? []) {
      productosPorId.set(Number(producto.id_producto), producto as Record<string, unknown>);
    }

    const detalle: Array<{
      id_producto: number;
      nombre_producto: string;
      cantidad: number;
      precio_unitario: number;
      stock_anterior: number;
    }> = [];

    // === Transformación Central: procesar_transaccion (R1, R2, R3, R4) ===
    for (const id of ids) {
      const cantidad = solicitados.get(id) ?? 0;
      const producto = productosPorId.get(id);

      // R1
      if (!producto) {
        return NextResponse.json({ error: "Producto no encontrado" }, { status: 400 });
      }

      const estado = String(producto.estado_producto ?? "");
      const stock = Number(producto.stock ?? 0);
      const precio = Number(producto.precio ?? 0);

      // R2
      if (estado !== "disponible") {
        return NextResponse.json({ error: "Producto agotado / no disponible" }, { status: 400 });
      }

      // R3
      if (stock < cantidad) {
        return NextResponse.json({ error: "Stock insuficiente" }, { status: 400 });
      }

      // R4
      detalle.push({
        id_producto: id,
        nombre_producto: String(producto.nombre_producto ?? ""),
        cantidad,
        precio_unitario: precio,
        stock_anterior: stock,
      });
    }

    const total_venta = detalle.reduce(
      (total, item) => total + item.precio_unitario * item.cantidad,
      0
    );

    // === Rama Eferente: registrar_venta_realizada ===
    const fecha = fechaLocal();
    const hora = horaLocal();

    const { data: folios, error: foliosError } = await supabase
      .from("ventas")
      .select("folio_venta");

    if (foliosError) {
      return NextResponse.json({ error: foliosError.message }, { status: 500 });
    }

    const folio_venta = siguienteFolio(folios as Array<{ folio_venta: string }> | null, "VTA");

    const { error: ventaError } = await supabase.from("ventas").insert({
      folio_venta,
      fecha,
      hora,
      total_venta,
      metodo_pago,
    });

    if (ventaError) {
      return NextResponse.json({ error: ventaError.message }, { status: 500 });
    }

    const { error: detalleError } = await supabase.from("detalle_venta").insert(
      detalle.map((item) => ({
        folio_venta,
        id_producto: item.id_producto,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
      }))
    );

    if (detalleError) {
      return NextResponse.json({ error: detalleError.message }, { status: 500 });
    }

    for (const item of detalle) {
      const nuevoStock = item.stock_anterior - item.cantidad;
      const nuevoEstado = nuevoStock <= 0 ? "agotado" : "disponible";

      const { error: stockError } = await supabase
        .from("productos")
        .update({ stock: nuevoStock, estado_producto: nuevoEstado })
        .eq("id_producto", item.id_producto);

      if (stockError) {
        return NextResponse.json({ error: stockError.message }, { status: 500 });
      }
    }

    return NextResponse.json(
      {
        folio_venta,
        fecha,
        hora,
        total_venta,
        metodo_pago,
        detalle: detalle.map((item) => ({
          id_producto: item.id_producto,
          nombre_producto: item.nombre_producto,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
        })),
        mensaje: "Venta registrada exitosamente",
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
