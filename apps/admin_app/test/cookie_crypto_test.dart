import 'dart:convert';

import 'package:admin_app/core/security/cookie_crypto.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

List<int> _key(String seed) => sha256.convert(utf8.encode(seed)).bytes;

void main() {
  group('CookieCrypto', () {
    final key = _key('pin-derived-key-A');
    final otherKey = _key('pin-derived-key-B');

    test('round-trip: descifra lo que cifra con la misma llave', () {
      const plain = '{"aienc_admin_session":"abc.def.ghi","exp":123}';
      final blob = CookieCrypto.encryptString(plain, key);
      expect(CookieCrypto.decryptToString(blob, key), plain);
    });

    test('cada cifrado usa un IV distinto (no determinista)', () {
      const plain = 'mismo-texto';
      final a = CookieCrypto.encryptString(plain, key);
      final b = CookieCrypto.encryptString(plain, key);
      expect(a, isNot(equals(b)));
      // Pero ambos descifran al mismo texto.
      expect(CookieCrypto.decryptToString(a, key), plain);
      expect(CookieCrypto.decryptToString(b, key), plain);
    });

    test('llave incorrecta → null (fail-safe, no lanza)', () {
      final blob = CookieCrypto.encryptString('secreto', key);
      expect(CookieCrypto.decryptToString(blob, otherKey), isNull);
    });

    test('datos manipulados → null (GCM detecta el tampering)', () {
      final blob = CookieCrypto.encryptString('secreto', key);
      final tampered = List<int>.from(blob);
      tampered[tampered.length - 1] ^= 0xFF; // corrompe el tag
      expect(CookieCrypto.decryptToString(tampered, key), isNull);
    });

    test('bytes en claro / demasiado cortos → null (no lanza)', () {
      expect(CookieCrypto.decryptToString(utf8.encode('texto plano'), key),
          isNull);
      expect(CookieCrypto.decryptToString(<int>[1, 2, 3], key), isNull);
    });

    test('maneja unicode', () {
      const plain = 'iglesia Bucaramanga — ñ áé, 教会';
      final blob = CookieCrypto.encryptString(plain, key);
      expect(CookieCrypto.decryptToString(blob, key), plain);
    });
  });
}
