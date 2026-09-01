# Pruebas de extremo a extremo

Aquí no hay ninguna todavía, y es mejor eso que la que había.

Existía `app.e2e-spec.ts` con este contenido:

```ts
const moduleFixture = await Test.createTestingModule({}).compile();
// ...
return request(app.getHttpServer()).get('/').expect(404);
```

El módulo estaba **vacío**: no montaba `AppModule` ni nada del proyecto. Ese
`404` lo devuelve cualquier aplicación Nest recién creada, así que la prueba
pasaba siempre y no comprobaba una sola línea de AIENC. Se llamaba
"AppModule (e2e)" y aparecía en el recuento de pruebas, dando una confianza que
no correspondía: una regresión real en el arranque —por ejemplo el fallo de
migraciones sobre una base vacía— jamás la habría detectado.

## Qué hace falta para escribir unas de verdad

`AppModule` abre la conexión a la base de datos al inicializarse y corre las
migraciones, así que una prueba de extremo a extremo necesita una base de datos
de prueba. Dos caminos razonables:

- Una base desechable levantada para la ocasión (contenedor o base aparte en el
  Postgres local), con `DATABASE_URL` apuntando a ella.
- Sustituir el módulo de base de datos por uno en memoria, que es más rápido
  pero deja de probar las migraciones, que es justo lo que más conviene probar.

Y montar la aplicación con `FastifyAdapter`, como en producción: la variante por
defecto de `createNestApplication()` usa Express y probaría una pila HTTP
distinta de la real.

La configuración (`jest-e2e.json`) y el guion `npm run test:e2e` siguen aquí
para que añadirlas sea sólo escribir el archivo.
