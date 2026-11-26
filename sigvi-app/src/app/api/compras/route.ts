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

function siguienteFolio(folios: Array<{ folio_compra: string }> | null, prefijo: string): string {
  let maximo = 0;

  for (const fila of folios ?? []) {
    const coincidencia = String(fila.folio_compra ?? "").match(/(\d+)$/);
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
      .from("compras")
      .select(`
        *,
        detalle_compra (*)
      `)
      .order("fecha", { ascending: false });

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
          id_producto?: unknown;
          cantidad?: unknown;
          costo_unitario?: unknown;
          proveedor?: unknown;
        }
      | null;

    if (!body) {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
    }

    const id_producto = Number(body.id_producto);
    const cantidad = Number(body.cantidad);
    const costo_unitario = Number(body.costo_unitario);
    const proveedor = String(body.proveedor ?? "").trim();

    if (!Number.isInteger(id_producto) || id_producto <= 0) {
      return NextResponse.json({ error: "id_producto es obligatorio" }, { status: 400 });
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return NextResponse.json(
        { error: "La cantidad debe ser un entero mayor a 0" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(costo_unitario) || costo_unitario < 0) {
      return NextResponse.json(
        { error: "El costo_unitario debe ser un número mayor o igual a 0" },
        { status: 400 }
      );
    }

    const { data: producto, error: productoError } = await supabase
      .from("productos")
      .select("id_producto, nombre_producto, stock, estado_producto")
      .eq("id_producto", id_producto)
      .maybeSingle();

    if (productoError) {
      return NextResponse.json({ error: productoError.message }, { status: 500 });
    }

    if (!producto) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const { data: folios, error: foliosError } = await supabase
      .from("compras")
      .select("folio_compra");

    if (foliosError) {
      return NextResponse.json({ error: foliosError.message }, { status: 500 });
    }

    const folio_compra = siguienteFolio(folios as Array<{ folio_compra: string }> | null, "CMP");
    const fecha = fechaLocal();
    const total_compra = costo_unitario * cantidad;

    const { error: compraError } = await supabase.from("compras").insert({
      folio_compra,
      fecha,
      total_compra,
      proveedor: proveedor.length > 0 ? proveedor : null,
    });

    if (compraError) {
      return NextResponse.json({ error: compraError.message }, { status: 500 });
    }

    const { error: detalleError } = await supabase.from("detalle_compra").insert({
      folio_compra,
      id_producto,
      cantidad,
      costo_unitario,
    });

    if (detalleError) {
      return NextResponse.json({ error: detalleError.message }, { status: 500 });
    }

    const nuevoStock = Number(producto.stock ?? 0) + cantidad;
    const estadoActual = String(producto.estado_producto ?? "");
    const nuevoEstado =
      estadoActual === "registrado" || estadoActual === "agotado"
        ? "disponible"
        : estadoActual;

    const { error: stockError } = await supabase
      .from("productos")
      .update({ stock: nuevoStock, estado_producto: nuevoEstado })
      .eq("id_producto", id_producto);

    if (stockError) {
      return NextResponse.json({ error: stockError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        folio_compra,
        fecha,
        id_producto,
        cantidad,
        costo_unitario,
        total_compra,
        proveedor: proveedor.length > 0 ? proveedor : null,
        stock: nuevoStock,
        estado_producto: nuevoEstado,
        mensaje: "Compra registrada exitosamente",
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
