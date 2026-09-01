import 'package:flutter_test/flutter_test.dart';

import 'package:admin_app/core/utils/montos.dart';

/// Regresión: un monto escrito con coma o con puntos de miles se guardaba
/// como cero, sin aviso, porque `double.tryParse` devolvía null y detrás había
/// un `?? 0`. Los informes financieros quedaban en cero y contaminaban las
/// métricas.
void main() {
  group('parseMonto', () {
    test('acepta un número plano', () {
      expect(parseMonto('50000'), 50000);
    });

    test('trata el punto de miles como miles, no como decimal', () {
      expect(parseMonto('50.000'), 50000);
      expect(parseMonto('1.234.567'), 1234567);
    });

    test('trata la coma de miles como miles', () {
      expect(parseMonto('50,000'), 50000);
    });

    test('acepta la coma decimal española', () {
      expect(parseMonto('50000,50'), 50000.5);
      expect(parseMonto('1.234.567,89'), closeTo(1234567.89, 0.001));
    });

    test('acepta el punto decimal inglés', () {
      expect(parseMonto('50000.50'), 50000.5);
      expect(parseMonto('1,234,567.89'), closeTo(1234567.89, 0.001));
    });

    test('acepta una sola cifra decimal', () {
      expect(parseMonto('100,5'), 100.5);
    });

    test('ignora espacios y el signo de peso', () {
      expect(parseMonto(' \$ 50.000 '), 50000);
    });

    test('devuelve null en vez de cero cuando el texto no es un monto', () {
      expect(parseMonto(''), isNull);
      expect(parseMonto('   '), isNull);
      expect(parseMonto('abc'), isNull);
      expect(parseMonto('50 mil'), isNull);
      expect(parseMonto('.'), isNull);
      expect(parseMonto(',,'), isNull);
    });
  });

  group('parseCantidad', () {
    test('acepta enteros con y sin separadores', () {
      expect(parseCantidad('120'), 120);
      expect(parseCantidad('1.500'), 1500);
      expect(parseCantidad('1,500'), 1500);
    });

    test('devuelve null cuando no es una cantidad', () {
      expect(parseCantidad(''), isNull);
      expect(parseCantidad('muchos'), isNull);
    });
  });
}
