import 'package:flutter/material.dart';

import 'gem_palette.dart';
import 'theme_controller.dart';

/// Tema de la app para una tonalidad ([GemColors.light] o [GemColors.dark]).
class AppTheme {
  AppTheme._();

  static ThemeData build(GemColors c) {
    final base = ThemeData(brightness: c.brightness);

    final colorScheme = c.isDark
        ? ColorScheme.dark(
            primary: c.sapphire,
            onPrimary: Colors.white,
            secondary: c.emerald,
            onSecondary: Colors.white,
            tertiary: c.topaz,
            onTertiary: Colors.black,
            surface: c.surface,
            onSurface: c.textPrimary,
            error: c.danger,
            onError: Colors.white,
          )
        : ColorScheme.light(
            primary: c.sapphire,
            onPrimary: Colors.white,
            secondary: c.emerald,
            onSecondary: Colors.white,
            tertiary: c.topazText,
            onTertiary: Colors.white,
            surface: c.surface,
            onSurface: c.textPrimary,
            onSurfaceVariant: c.textMuted,
            surfaceContainerHighest: const Color(0xFFE9F0F9),
            outline: c.borderSoft,
            error: c.danger,
            onError: Colors.white,
          );

    return base.copyWith(
      colorScheme: colorScheme,
      scaffoldBackgroundColor: c.background,
      canvasColor: c.background,
      cardColor: c.surface,
      dividerColor: c.borderSoft,
      splashFactory: InkRipple.splashFactory,
      visualDensity: VisualDensity.adaptivePlatformDensity,
      textTheme: _buildTextTheme(base.textTheme, c),
      // Todas las pantallas entran igual (las de go_router y las que se abren
      // con Navigator.push): un fundido con un leve desplazamiento hacia arriba.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: FadeSlidePageTransitionsBuilder(),
          TargetPlatform.iOS: FadeSlidePageTransitionsBuilder(),
        },
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: ThemeController.overlayStyleFor(c),
        titleTextStyle: TextStyle(
          color: c.textPrimary,
          fontSize: 18,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.2,
        ),
        iconTheme: IconThemeData(color: c.textPrimary),
        actionsIconTheme: IconThemeData(color: c.textPrimary),
      ),
      iconTheme: IconThemeData(color: c.textPrimary),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: c.isDark ? c.surface : const Color(0xFFF7FAFE),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
        labelStyle: TextStyle(color: c.textMuted, fontWeight: FontWeight.w600),
        hintStyle: TextStyle(color: c.textMuted),
        floatingLabelStyle: TextStyle(
          color: c.sapphire,
          fontWeight: FontWeight.w700,
        ),
        border: _outline(c.borderSoft),
        enabledBorder: _outline(c.borderSoft),
        focusedBorder: _outline(c.sapphire, width: 2),
        errorBorder: _outline(c.danger),
        focusedErrorBorder: _outline(c.danger, width: 2),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: c.sapphire,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 48),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: c.textPrimary,
          side: BorderSide(color: c.borderSoft),
          minimumSize: const Size(0, 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: c.emerald,
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: c.emerald,
        foregroundColor: Colors.white,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: c.snackBackground,
        contentTextStyle: TextStyle(color: c.snackText),
        actionTextColor: c.isDark ? c.topaz : const Color(0xFFF2D58A),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      cardTheme: CardThemeData(
        color: c.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: c.surfaceElevated,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: c.surfaceElevated,
        modalBackgroundColor: c.surfaceElevated,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: c.surfaceElevated,
        headerBackgroundColor: c.sapphire,
        headerForegroundColor: Colors.white,
      ),
      timePickerTheme: TimePickerThemeData(backgroundColor: c.surfaceElevated),
    );
  }

  static OutlineInputBorder _outline(Color color, {double width = 1}) {
    return OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: color, width: width),
    );
  }

  static TextTheme _buildTextTheme(TextTheme base, GemColors c) {
    return base
        .apply(bodyColor: c.textPrimary, displayColor: c.textPrimary)
        .copyWith(
          displayLarge: TextStyle(
            fontSize: 38,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.8,
            height: 1.02,
            color: c.textPrimary,
          ),
          headlineMedium: TextStyle(
            fontSize: 27,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.4,
            color: c.textPrimary,
          ),
          headlineSmall: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.2,
            color: c.textPrimary,
          ),
          titleLarge: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.2,
            color: c.textPrimary,
          ),
          titleMedium: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: c.textPrimary,
          ),
          bodyMedium: TextStyle(
            fontSize: 14,
            height: 1.45,
            color: c.textPrimary,
          ),
          bodySmall: TextStyle(fontSize: 12.5, color: c.textMuted, height: 1.4),
          labelMedium: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.4,
            color: c.textPrimary,
          ),
        );
  }
}

/// Transición de página: fundido con un leve desplazamiento hacia arriba, la
/// misma que usan las rutas de go_router (ver `router.dart`). Respeta la
/// opción de accesibilidad de quitar animaciones.
class FadeSlidePageTransitionsBuilder extends PageTransitionsBuilder {
  const FadeSlidePageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final reduce = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduce) return child;
    final curved = CurvedAnimation(
      parent: animation,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.018),
          end: Offset.zero,
        ).animate(curved),
        child: child,
      ),
    );
  }
}
