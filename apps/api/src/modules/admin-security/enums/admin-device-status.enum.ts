export enum AdminDeviceStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  REVOKED = "REVOKED",
  /**
   * Navegador cuya sesión se cerró (con "Cerrar sesión" o desde la app). Su
   * aprobación ya no vale: para volver a entrar hay que aprobarlo de nuevo
   * desde la app. A diferencia de REVOKED, no tiene espera para reintentar.
   */
  SIGNED_OUT = "SIGNED_OUT",
}
