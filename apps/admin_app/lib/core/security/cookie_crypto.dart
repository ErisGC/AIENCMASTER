import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:pointycastle/export.dart';

/// Cifrado AES-256-GCM para el cookie jar en reposo.
///
/// El formato en disco es: `iv(12 bytes) || ciphertext || tag(16 bytes)`. GCM
/// autentica, así que una llave incorrecta o datos manipulados hacen que el
/// descifrado lance (fallo del MAC) y [decryptToString] devuelva `null` — el
/// llamador lo trata como "sin cookie" (fail-safe: fuerza re-login, nunca
/// corrompe ni bloquea).
///
/// Usamos pointycastle directo en vez del wrapper `encrypt`, cuyo modo GCM no
/// verifica el tag de autenticación (una llave incorrecta devolvía texto
/// basura en vez de fallar).
class CookieCrypto {
  CookieCrypto._();

  static const int _ivLength = 12; // nonce estándar de GCM
  static const int _macBits = 128; // tag de 16 bytes

  static final Random _rng = Random.secure();

  static GCMBlockCipher _cipher(bool forEncryption, List<int> key, Uint8List iv) {
    return GCMBlockCipher(AESEngine())
      ..init(
        forEncryption,
        AEADParameters(
          KeyParameter(Uint8List.fromList(key)),
          _macBits,
          iv,
          Uint8List(0), // sin datos asociados
        ),
      );
  }

  /// Cifra [plaintext] y devuelve `iv || ciphertext || tag`.
  static Uint8List encryptString(String plaintext, List<int> key) {
    final iv = Uint8List.fromList(
      List<int>.generate(_ivLength, (_) => _rng.nextInt(256)),
    );
    final out = _cipher(true, key, iv)
        .process(Uint8List.fromList(utf8.encode(plaintext)));
    final result = Uint8List(_ivLength + out.length);
    result.setRange(0, _ivLength, iv);
    result.setRange(_ivLength, result.length, out);
    return result;
  }

  /// Descifra bytes producidos por [encryptString]. Devuelve `null` si la llave
  /// es incorrecta, los datos están manipulados o el formato no coincide.
  static String? decryptToString(List<int> bytes, List<int> key) {
    try {
      // iv(12) + tag(16) mínimos; menos que eso no puede ser válido.
      if (bytes.length <= _ivLength + 16) return null;
      final data = Uint8List.fromList(bytes);
      final iv = data.sublist(0, _ivLength);
      final ct = data.sublist(_ivLength);
      final out = _cipher(false, key, iv).process(ct);
      return utf8.decode(out);
    } catch (_) {
      // Fallo del MAC (llave incorrecta / tampering) o formato inválido.
      return null;
    }
  }
}
