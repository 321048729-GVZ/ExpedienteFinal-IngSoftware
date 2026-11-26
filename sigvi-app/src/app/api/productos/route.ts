import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

const ESTADOS_FINALES = new Set(["baja", "descontinuado"]);

const EVENTOS_VALIDOS = new Set([
  "ingresar_stock",
  "dar_de_baja",
  "reabastecer",
  "descontinuar",
]);

function mensajeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Error interno del servidor";
}

function numeroPositivo(value: unknown, defecto = 1): number {
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero <= 0) return defecto;
  return Math.floor(numero);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const idParam = request.nextUrl.searchParams.get("id");

    if (idParam !== null && idParam.trim() !== "") {
      const id = Number(idParam);

      if (!Number.isInteger(id)) {
        return NextResponse.json({ error: "El id debe ser un número entero" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .eq("id_producto", id)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
      }

      return NextResponse.json(data, { status: 200 });
    }

    const { data, error } = await supabase
      .from("productos")
      .select("*")
      .order("id_producto", { ascending: true });

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
      | { id_producto?: unknown; nombre_producto?: unknown; precio?: unknown }
      | null;

    if (!body) {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
    }

    const nombre_producto = String(body.nombre_producto ?? "").trim();
    const precio = Number(body.precio);

    if (!nombre_producto) {
      return NextResponse.json({ error: "El nombre del producto es obligatorio" }, { status: 400 });
    }

    if (!Number.isFinite(precio) || precio < 0) {
      return NextResponse.json({ error: "El precio debe ser un número mayor o igual a 0" }, { status: 400 });
    }

    let id_producto = Number(body.id_producto);

    if (body.id_producto === undefined || body.id_producto === null || body.id_producto === "" || !Number.isInteger(id_producto) || id_producto <= 0) {
      const { data: ultimo, error: ultimoError } = await supabase
        .from("productos")
        .select("id_producto")
        .order("id_producto", { ascending: false })
        .limit(1);

      if (ultimoError) {
        return NextResponse.json({ error: ultimoError.message }, { status: 500 });
      }

      id_producto = Number(ultimo?.[0]?.id_producto ?? 457189) + 1;
    }

    const { data, error } = await supabase
      .from("productos")
      .insert({
        id_producto,
        nombre_producto,
        precio,
        stock: 0,
        estado_producto: "registrado",
      })
      .select()
      .single();

    if (error) {
      const status = error.code === "23505" ? 400 : 500;
      const mensaje = error.code === "23505"
        ? "Ya existe un producto con ese id_producto"
        : error.message;
      return NextResponse.json({ error: mensaje }, { status });
    }

    return NextResponse.json(
      { ...data, mensaje: "Producto registrado correctamente" },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();
    const body = (await request.json().catch(() => null)) as
      | { id_producto?: unknown; evento?: unknown; cantidad?: unknown }
      | null;

    if (!body) {
      return NextResponse.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
    }

    const id_producto = Number(body.id_producto);
    const evento = String(body.evento ?? "");
    const cantidad = numeroPositivo(body.cantidad, 1);

    if (!Number.isInteger(id_producto) || id_producto <= 0) {
      return NextResponse.json({ error: "id_producto es requerido" }, { status: 400 });
    }

    if (!EVENTOS_VALIDOS.has(evento)) {
      return NextResponse.json({ error: "Evento inválido" }, { status: 400 });
    }

    const { data: producto, error: fetchError } = await supabase
      .from("productos")
      .select("id_producto, nombre_producto, stock, estado_producto")
      .eq("id_producto", id_producto)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!producto) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const estadoActual = String(producto.estado_producto);
    const stockActual = Number(producto.stock ?? 0);

    if (ESTADOS_FINALES.has(estadoActual)) {
      return NextResponse.json(
        { error: `El producto está en estado final '${estadoActual}' y no puede modificarse` },
        { status: 400 }
      );
    }

    let actualizacion: { estado_producto: string; stock?: number } | null = null;
    let mensaje = "";

    if (estadoActual === "registrado" && evento === "ingresar_stock") {
      actualizacion = { estado_producto: "disponible", stock: stockActual + cantidad };
      mensaje = `Stock ingresado (${cantidad}). Producto disponible.`;
    } else if (estadoActual === "registrado" && evento === "dar_de_baja") {
      actualizacion = { estado_producto: "baja" };
      mensaje = "Producto dado de baja.";
    } else if (estadoActual === "disponible" && evento === "descontinuar") {
      actualizacion = { estado_producto: "descontinuado" };
      mensaje = "Producto descontinuado.";
    } else if (estadoActual === "agotado" && evento === "reabastecer") {
      actualizacion = { estado_producto: "disponible", stock: stockActual + cantidad };
      mensaje = `Producto reabastecido (${cantidad}). Ahora disponible.`;
    } else if (estadoActual === "agotado" && evento === "descontinuar") {
      actualizacion = { estado_producto: "descontinuado" };
      mensaje = "Producto descontinuado.";
    }

    if (!actualizacion) {
      return NextResponse.json(
        { error: `Transición '${evento}' no permitida desde el estado '${estadoActual}'` },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("productos")
      .update(actualizacion)
      .eq("id_producto", id_producto);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        id_producto,
        estado_anterior: estadoActual,
        estado_producto: actualizacion.estado_producto,
        stock: actualizacion.stock ?? stockActual,
        mensaje,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: mensajeError(error) }, { status: 500 });
  }
}
