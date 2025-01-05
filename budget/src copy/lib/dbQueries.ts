const ignoredDatabases = ['template_db1', 'template_db2', 'next', 'postgres']; // Add databases to ignore here

export const createDatabaseQuery = (dbName: string) => `CREATE DATABASE ${dbName}`;

export const dropDatabaseQuery = (dbName: string) => `DROP DATABASE ${dbName}`;

export const listDatabasesQuery = (ignoreDatabases: string[] = ignoredDatabases) => {
    const ignoreList = ignoreDatabases.map(db => `datname != '${db}'`).join(' AND ');
    return `SELECT datname FROM pg_database WHERE datistemplate = false${ignoreList ? ` AND ${ignoreList}` : ''};`;
};

export const createAccountsTable = async (db: any) => {
    await db.query('SET search_path TO public;');

    const query = `DROP TABLE IF EXISTS accounts;
    CREATE TABLE accounts (
        account_id SERIAL PRIMARY KEY,
        account_name VARCHAR(255) NOT NULL,
        account_description TEXT,
        can_go_below_0 BOOLEAN NOT NULL,
        interest_nacm_positive_balance DECIMAL(10, 2),
        interest_nacm_negative_balance DECIMAL(10, 2)
    );`;
    await db.query(query);
};

export const listTablesQuery = async (db: any) => {
    const result = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public';");
    return result.rows; // Return the list of table names
};

export const deleteTableQuery = async (db: any, tableName: string) => {
    await db.query(`DROP TABLE IF EXISTS ${tableName};`);
};
