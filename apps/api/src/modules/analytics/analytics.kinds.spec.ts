import { NO_HUMANO, ZERO_UUID, validarConteo } from "./analytics.kinds";

const ID = "2f1c8a3e-9b7d-4c1a-8e2f-3a4b5c6d7e8f";

describe("validarConteo", () => {
  it("acepta una visita de página sin objetivo", () => {
    expect(validarConteo({ k: "inicio", v: "abcdefgh12" })).toEqual({
      tipo: "inicio",
      objetivo: ZERO_UUID,
      visitante: "abcdefgh12",
    });
  });

  it("lee el cuerpo enviado como texto", () => {
    expect(validarConteo(JSON.stringify({ k: "anuncio", t: ID }))?.objetivo).toBe(ID);
  });

  it("exige objetivo válido donde corresponde", () => {
    expect(validarConteo({ k: "anuncio" })).toBeNull();
    expect(validarConteo({ k: "anuncio", t: "no-es-un-id" })).toBeNull();
  });

  it("ignora tipos que no están en la lista y basura", () => {
    expect(validarConteo({ k: "lo-que-sea" })).toBeNull();
    expect(validarConteo("{malformado")).toBeNull();
    expect(validarConteo(null)).toBeNull();
  });

  it("descarta un identificador de visitante raro", () => {
    expect(validarConteo({ k: "inicio", v: "<script>" })?.visitante).toBeNull();
  });

  it("reconoce robots y vistas previas", () => {
    expect(NO_HUMANO.test("Googlebot/2.1")).toBe(true);
    expect(NO_HUMANO.test("WhatsApp/2.23")).toBe(true);
    expect(
      NO_HUMANO.test(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
  });
});
