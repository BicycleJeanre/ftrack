const ignoredDatabases = ['template_db1', 'template_db2', 'next', 'postgres']; // Add databases to ignore here

export const createDatabaseQuery = (dbName: string) => `CREATE DATABASE ${dbName}`;

export const dropDatabaseQuery = (dbName: string) => `DROP DATABASE ${dbName}`;

export const listDatabasesQuery = (ignoreDatabases: string[] = ignoredDatabases) => {
    const ignoreList = ignoreDatabases.map(db => `datname != '${db}'`).join(' AND ');
    return `SELECT datname FROM pg_database WHERE datistemplate = false${ignoreList ? ` AND ${ignoreList}` : ''};`;
};

export const createAccountsTable = async (db: any) => {
    const query = `DROP TABLE IF EXISTS budget.public.accounts;
    CREATE TABLE budget.public.accounts (
        account_id SERIAL PRIMARY KEY,
        account_name VARCHAR(255) NOT NULL,
        account_description TEXT,
        can_go_below_0 BOOLEAN NOT NULL,
        interest_nacm_positive_balance DECIMAL(10, 2),
        interest_nacm_negative_balance DECIMAL(10, 2)
    );`;
    await db.query(query);
};
