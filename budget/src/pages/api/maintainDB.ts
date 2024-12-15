import { query } from '../../lib/db';
import { createDatabaseQuery, dropDatabaseQuery, listDatabasesQuery, createAccountsTable } from '../../lib/dbQueries';
import { NextApiRequest, NextApiResponse } from 'next';

interface CustomNextApiRequest extends NextApiRequest {
    db: any;
}

export default async function handler(req: CustomNextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST' && req.body.action === 'createAccountsTable') {
    return handleCreateAccountsTable(req, res);
  } else if (req.method === 'POST') {
    const { dbName } = req.body;

    if (!dbName) {
      return res.status(400).json({ error: 'Database name is required' });
    }

    try {
      console.log(`Attempting to create database: ${dbName}`);
      await query(createDatabaseQuery(dbName));
      res.status(200).json({ message: `Database ${dbName} created successfully` });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error creating database' });
    }
  } else if (req.method === 'DELETE') {
    const { dbName } = req.body;

    if (!dbName) {
      return res.status(400).json({ error: 'Database name is required' });
    }

    try {
      console.log(`Attempting to drop database: ${dbName}`);
      await query(dropDatabaseQuery(dbName));
      res.status(200).json({ message: `Database ${dbName} removed successfully` });
    } catch (error) {
      console.error('Database removal error:', error);
      res.status(500).json({ error: 'Error removing database' });
    }
  } else if (req.method === 'GET') {
    try {
      const result = await query(listDatabasesQuery());
      const databases = result.rows.map(row => row.datname);
      res.status(200).json({ databases });
    } catch (error) {
      console.error('Error fetching databases:', error);
      res.status(500).json({ error: 'Error fetching databases' });
    }
  } else {
    res.setHeader('Allow', ['POST', 'DELETE', 'GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export const handleCreateAccountsTable = async (req: CustomNextApiRequest, res: NextApiResponse) => {
    try {
        await createAccountsTable(req.db);
        res.status(200).json({ message: 'Accounts table created successfully.' });
    } catch (error) {
        console.error('Error creating accounts table:', error);
        res.status(500).json({ message: 'Failed to create accounts table.' });
    }
};
