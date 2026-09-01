import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:admin_app/core/api/api_client.dart';

/// Regresión: el cliente HTTP está configurado para NO lanzar ante códigos de
/// error (`validateStatus` acepta hasta 599), de modo que un 401 o un 500
/// llegaban al código como si fueran una respuesta buena.
///
/// En las lecturas eso se traducía en pantallas vacías: el cuerpo del error es
/// un objeto, no una lista, así que los servicios devolvían la lista vacía y el
/// usuario veía "no hay iglesias" o un tablero en ceros ante un fallo real del
/// servidor. Estas pruebas fijan que un estado de error se convierta en una
/// excepción con mensaje en español.
void main() {
  Response<dynamic> respuesta(int code, dynamic data) => Response<dynamic>(
    requestOptions: RequestOptions(path: '/x'),
    statusCode: code,
    data: data,
  );

  group('ApiException.fromResponse', () {
    test('traduce los códigos a mensajes en español', () {
      expect(ApiException.fromResponse(respuesta(401, {})).message,
          contains('Sesión'));
      expect(ApiException.fromResponse(respuesta(403, {})).message,
          isNotEmpty);
      expect(ApiException.fromResponse(respuesta(404, {})).message,
          isNotEmpty);
      expect(ApiException.fromResponse(respuesta(500, {})).message,
          isNotEmpty);
    });

    test('conserva el código de estado para poder distinguirlos', () {
      expect(ApiException.fromResponse(respuesta(409, {})).statusCode, 409);
      expect(ApiException.fromResponse(respuesta(413, {})).statusCode, 413);
    });

    test('el mensaje nunca expone el cuerpo crudo del servidor', () {
      final e = ApiException.fromResponse(
        respuesta(500, {'stack': 'Error: at Object.<anonymous> (/app/dist)'}),
      );
      expect(e.message, isNot(contains('/app/dist')));
      expect(e.message, isNot(contains('anonymous')));
    });
  });
}
