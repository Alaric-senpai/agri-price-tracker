declare module 'swagger-ui-express' {
    import { RequestHandler } from 'express';
    export const serve: RequestHandler[];
    export function setup(
        swaggerDoc?: object,
        opts?: object,
        options?: object,
        customCss?: string,
        customFavicon?: string,
        swaggerUrl?: string,
        customSiteTitle?: string
    ): RequestHandler;
}
