/// Lectura de montos escritos a mano.
///
/// El teclado decimal de Android ofrece coma en español, y en Colombia lo
/// natural es escribir "50.000" o "1.234.567,89". `double.tryParse` sólo
/// entiende el punto como separador decimal, así que devolvía null para casi
/// todo lo que una persona escribe de verdad; con un `?? 0` detrás, el informe
/// se guardaba en cero sin avisar.
library;

/// Interpreta un monto en pesos escrito por una persona.
///
/// Acepta `50000`, `50.000`, `50,000`, `50000,50`, `1.234.567,89` y la
/// variante inglesa `1,234,567.89`.
///
/// La regla es la del último separador: manda el que aparece más a la derecha,
/// y sólo cuenta como decimal cuando lo siguen una o dos cifras. Con tres se
/// trata como separador de miles, que es lo habitual en pesos ("50.000" son
/// cincuenta mil, no cincuenta).
///
/// Devuelve `null` cuando el texto no es un monto reconocible, para que quien
/// llame pueda avisar en vez de guardar un cero en silencio.
double? parseMonto(String texto) {
  final limpio = texto.trim().replaceAll(RegExp(r'[\s$]'), '');
  if (limpio.isEmpty) return null;
  if (!RegExp(r'^[0-9.,]+$').hasMatch(limpio)) return null;

  final corte = [limpio.lastIndexOf('.'), limpio.lastIndexOf(',')]
      .reduce((a, b) => a > b ? a : b);

  var entero = limpio;
  var decimales = '';

  if (corte >= 0) {
    final cola = limpio.substring(corte + 1);
    if (cola.length == 1 || cola.length == 2) {
      entero = limpio.substring(0, corte);
      decimales = cola;
    }
  }

  entero = entero.replaceAll('.', '').replaceAll(',', '');
  if (entero.isEmpty && decimales.isEmpty) return null;
  if (!RegExp(r'^[0-9]*$').hasMatch(entero)) return null;

  final valor = double.tryParse(
    '${entero.isEmpty ? '0' : entero}.${decimales.isEmpty ? '0' : decimales}',
  );
  if (valor == null || valor.isNaN || valor.isInfinite) return null;
  return valor;
}

/// Igual que [parseMonto] pero para cantidades enteras (asistentes, etc.).
///
/// Tolera los separadores de miles ("1.500") y rechaza los decimales: no hay
/// media persona en una reunión.
int? parseCantidad(String texto) {
  final limpio = texto.trim().replaceAll(RegExp(r'[\s]'), '');
  if (limpio.isEmpty) return null;
  if (!RegExp(r'^[0-9.,]+$').hasMatch(limpio)) return null;

  final soloDigitos = limpio.replaceAll('.', '').replaceAll(',', '');
  if (soloDigitos.isEmpty) return null;
  return int.tryParse(soloDigitos);
}
