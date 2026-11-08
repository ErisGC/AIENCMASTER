import 'package:flutter/material.dart';

import '../theme/gem_palette.dart';
import 'theme_toggle.dart';

/// Tarjeta con borde gradient + fondo surface. Equivale al `.formCard` /
/// `.listCard` de la web. Si recibe onTap, añade una micro-interacción de
/// press-scale (escala sutil al presionar) para dar feedback táctil.
class GemCard extends StatefulWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final bool gradientBorder;
  final VoidCallback? onTap;
  final Gradient? borderGradient;

  const GemCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.gradientBorder = true,
    this.onTap,
    this.borderGradient,
  });

  @override
  State<GemCard> createState() => _GemCardState();
}

class _GemCardState extends State<GemCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      decoration: BoxDecoration(
        gradient: GemPalette.surfaceGradient,
        borderRadius: BorderRadius.circular(22),
        border: widget.gradientBorder
            ? null
            : Border.all(color: GemPalette.borderSoft, width: 1),
        boxShadow: [
          BoxShadow(
            color: GemPalette.shadow,
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      padding: widget.padding,
      child: widget.child,
    );

    final Widget content;
    if (!widget.gradientBorder) {
      content = card;
    } else {
      final stroke = ShaderMask(
        shaderCallback: (rect) =>
            (widget.borderGradient ?? GemPalette.primaryGradient)
                .createShader(rect),
        blendMode: BlendMode.srcIn,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border:
                Border.all(width: 1, color: Colors.white.withValues(alpha: 0.6)),
          ),
        ),
      );
      content = Stack(
        // La tarjeta toma el ancho que le dan (antes se encogía a su contenido
        // y en modo claro se notaba su fondo más angosto que el borde).
        fit: StackFit.passthrough,
        children: [
          card,
          Positioned.fill(child: IgnorePointer(child: stroke)),
        ],
      );
    }

    return _wrapTap(content);
  }

  Widget _wrapTap(Widget child) {
    if (widget.onTap == null) return child;
    return AnimatedScale(
      scale: _pressed ? 0.98 : 1,
      duration: const Duration(milliseconds: 130),
      curve: Curves.easeOut,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: widget.onTap,
          onHighlightChanged: (h) {
            if (mounted) setState(() => _pressed = h);
          },
          child: child,
        ),
      ),
    );
  }
}

/// Header de sección con banda de gradiente de gemas. Unifica el encabezado
/// de todas las pantallas principales (Métricas, Anuncios, Iglesias, Informes,
/// Seguridad) con el mismo lenguaje visual del portal web.
class GemSectionHeader extends StatelessWidget {
  final String eyebrow;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final EdgeInsetsGeometry margin;
  final bool showThemeToggle;

  const GemSectionHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    this.subtitle,
    this.trailing,
    this.margin = const EdgeInsets.fromLTRB(16, 16, 16, 8),
    this.showThemeToggle = true,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: const EdgeInsets.fromLTRB(18, 16, 10, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          // En claro, un velo de cielo más tenue; en oscuro, el de siempre.
          colors: GemPalette.current.isDark
              ? [
                  GemPalette.sapphire.withValues(alpha: 0.32),
                  GemPalette.emerald.withValues(alpha: 0.14),
                ]
              : [
                  GemPalette.sapphire.withValues(alpha: 0.13),
                  GemPalette.emerald.withValues(alpha: 0.07),
                  GemPalette.topaz.withValues(alpha: 0.10),
                ],
        ),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: GemPalette.borderSoft.withValues(alpha: 0.5),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  eyebrow.toUpperCase(),
                  style: TextStyle(
                    color: GemPalette.textMuted,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                    letterSpacing: 1.6,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  title,
                  style: Theme.of(context).textTheme.headlineMedium,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ],
            ),
          ),
          ?trailing,
          // Cambio de tonalidad a la mano en el encabezado de cada pestaña.
          if (showThemeToggle) const ThemeToggleButton(),
        ],
      ),
    );
  }
}

/// Botón principal con gradient gemas.
class GemPrimaryButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool loading;

  const GemPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
  });

  @override
  Widget build(BuildContext context) {
    final disabled = onPressed == null || loading;
    return Opacity(
      opacity: disabled ? 0.6 : 1,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            gradient: GemPalette.primaryGradient,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: GemPalette.sapphire.withValues(alpha: 0.35),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: disabled ? null : onPressed,
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (loading)
                    const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        valueColor: AlwaysStoppedAnimation(Colors.white),
                      ),
                    )
                  else if (icon != null)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Icon(icon, color: Colors.white, size: 18),
                    ),
                  if (!loading)
                    Text(
                      label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        letterSpacing: 0.2,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Chip / badge para estados (status REQUEST, role ROOT, etc.).
class GemBadge extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;

  const GemBadge({
    super.key,
    required this.label,
    required this.color,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    // El oro decorativo no se lee como texto sobre fondo claro: el texto y el
    // ícono usan su versión más profunda.
    final fg = color == GemPalette.topaz ? GemPalette.topazText : color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: color.withValues(alpha: 0.35), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: fg,
              fontWeight: FontWeight.w700,
              fontSize: 11.5,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

/// KPI grande para el dashboard.
class KpiTile extends StatelessWidget {
  final String label;
  final String value;
  final String? subtitle;
  final Gradient borderGradient;
  final IconData? icon;

  const KpiTile({
    super.key,
    required this.label,
    required this.value,
    required this.borderGradient,
    this.subtitle,
    this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return GemCard(
      borderGradient: borderGradient,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label.toUpperCase(),
                  style: TextStyle(
                    color: GemPalette.textMuted,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                    letterSpacing: 0.7,
                  ),
                ),
              ),
              if (icon != null) Icon(icon, color: GemPalette.textMuted, size: 16),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

/// Banner inline para errores no fatales (ej. fallo de un fetch).
class GemErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback? onDismiss;

  const GemErrorBanner({super.key, required this.message, this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      decoration: BoxDecoration(
        color: GemPalette.danger.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: GemPalette.danger.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: GemPalette.danger, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: GemPalette.danger,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ),
          if (onDismiss != null)
            IconButton(
              icon: Icon(Icons.close, size: 18, color: GemPalette.danger),
              onPressed: onDismiss,
              splashRadius: 18,
            ),
        ],
      ),
    );
  }
}

/// "Pill" pequeña para opciones tipo toggle (template Pastor/Tesorero...).
class GemPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const GemPill({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(100),
      child: InkWell(
        borderRadius: BorderRadius.circular(100),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(100),
            gradient: selected ? GemPalette.sapphireEmeraldGradient : null,
            color: selected ? null : GemPalette.chip,
            border: Border.all(
              color: selected
                  ? Colors.transparent
                  : GemPalette.borderSoft.withValues(alpha: 0.6),
            ),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : GemPalette.textPrimary,
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
              letterSpacing: 0.2,
            ),
          ),
        ),
      ),
    );
  }
}

/// Lista vacía o que no cargó. Siempre deja una salida: el botón para volver
/// a intentar y el gesto de deslizar hacia abajo (antes, si una pestaña
/// fallaba al abrir la app, quedaba rota hasta reiniciarla).
class GemListMessage extends StatelessWidget {
  const GemListMessage({
    super.key,
    required this.message,
    this.isError = false,
    this.icon,
    this.onRetry,
  });

  final String message;
  final bool isError;
  final IconData? icon;
  final Future<void> Function()? onRetry;

  @override
  Widget build(BuildContext context) {
    final contenido = LayoutBuilder(
      builder: (context, constraints) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(28, 24, 28, 96),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      icon ??
                          (isError
                              ? Icons.cloud_off_outlined
                              : Icons.inbox_outlined),
                      size: 44,
                      color: (isError ? GemPalette.danger : GemPalette.textMuted)
                          .withValues(alpha: 0.75),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: GemPalette.textMuted, height: 1.5),
                    ),
                    if (onRetry != null && isError) ...[
                      const SizedBox(height: 16),
                      OutlinedButton.icon(
                        onPressed: onRetry,
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('Reintentar'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
    if (onRetry == null) return contenido;
    return RefreshIndicator(onRefresh: onRetry!, child: contenido);
  }
}

/// Protege un formulario: si la persona ya escribió algo y toca "atrás", se
/// le pregunta antes de descartar (antes el gesto de atrás borraba un informe
/// o un evento a medio llenar sin avisar). Guardar sigue cerrando directo.
class DiscardGuard extends StatelessWidget {
  const DiscardGuard({super.key, required this.dirty, required this.child});

  final bool dirty;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final salir = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('¿Descartar lo que escribiste?'),
            content: const Text('Si sales ahora, los cambios no se guardan.'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Seguir editando'),
              ),
              TextButton(
                style: TextButton.styleFrom(foregroundColor: GemPalette.danger),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Descartar'),
              ),
            ],
          ),
        );
        if (salir == true && context.mounted) Navigator.of(context).pop();
      },
      child: child,
    );
  }
}

