import swaggerJSDoc from 'swagger-jsdoc';

const options: swaggerJSDoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Agri Price tracker API',
            version: '1.0.0',
            description: 'Agri Price tracker API documentation'
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Local development server'
            }
        ]
    },

    // Paths to files containing OpenAPI annotations
    apis: [
        './src/routes/**/*.ts',
        './src/controllers/**/*.ts'
    ]
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
