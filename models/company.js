"use strict";

const db = require("../db");
const { BadRequestError, NotFoundError } = require("../expressError");
const { sqlForPartialUpdate } = require("../helpers/sql");

/** Related functions for companies. */

class Company {
  /** Create a company (from data), update db, return new company data.
   *
   * data should be { handle, name, description, numEmployees, logoUrl }
   *
   * Returns { handle, name, description, numEmployees, logoUrl }
   *
   * Throws BadRequestError if company already in database.
   * */

  static async create({ handle, name, description, numEmployees, logoUrl }) {
    const duplicateCheck = await db.query(`
        SELECT handle
        FROM companies
        WHERE handle = $1`, [handle]);

    if (duplicateCheck.rows[0])
      throw new BadRequestError(`Duplicate company: ${handle}`);

    const result = await db.query(`
                INSERT INTO companies (handle,
                                       name,
                                       description,
                                       num_employees,
                                       logo_url)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING
                    handle,
                    name,
                    description,
                    num_employees AS "numEmployees",
                    logo_url AS "logoUrl"`, [
      handle,
      name,
      description,
      numEmployees,
      logoUrl,
    ],
    );
    const company = result.rows[0];

    return company;
  }

  /** Find all companies.
   *
   * Takes filter object. Can filter on provided search filters:
    * - minEmployees
    * - maxEmployees
    * - nameLike (will find case-insensitive, partial matches)
   *
   * Returns [{ handle, name, description, numEmployees, logoUrl }, ...]
   * */
  static async findAll(filter = {}) {
    let whereClause = '';
    const { minEmployees, maxEmployees, nameLike } = filter;

    if (minEmployees > maxEmployees) {
      throw new BadRequestError('minEmployees must be less than maxEmployees');
    }

    // if (Object.keys(filter).length > 0) {
    //   whereClause = 'WHERE ';
    //   const filters = [];
    //   if (minEmployees) filters.push(`num_employees >= ${minEmployees}`);
    //   if (maxEmployees) filters.push(`num_employees <= ${maxEmployees}`);
    //   if (nameLike) filters.push(`name ILIKE '%${nameLike}%'`);
    //   whereClause += filters.join(' AND ');
    // }

    const { setCols, values } = this._filterCompanies(filter);


    const companiesRes = await db.query(`
        SELECT handle,
               name,
               description,
               num_employees AS "numEmployees",
               logo_url      AS "logoUrl"
        FROM companies
        ${setCols}
        ORDER BY name`,
      [...values]);
    return companiesRes.rows;
  }


  /**
   *  Takes filter object, returns sql query to filter
    * - minEmployees
    * - maxEmployees
    * - nameLike (will find case-insensitive, partial matches)
   */
  static _filterCompanies(data) {
    const keys = Object.keys(data);

    if (keys.length < 1) {
      return {setCols: "", values: []};
    }

    let whereClause = 'WHERE ';

    const filters = keys.map((colName, idx) => {
      if (colName === "minEmployees") return (`num_employees >= $${idx + 1}`);
      if (colName === "maxEmployees") return (`num_employees <=  $${idx + 1}`);
      if (colName === "nameLike") return (`name ILIKE '%'||$${idx + 1}||'%'`);
    });

    return {
      setCols: whereClause += filters.join(' AND '),
      values: Object.values(data)
    };

  }

  /** Given a company handle, return data about company.
   *
   * Returns { handle, name, description, numEmployees, logoUrl, jobs }
   *   where jobs is [{ id, title, salary, equity, companyHandle }, ...]
   *
   * Throws NotFoundError if not found.
   **/

  static async get(handle) {
    const companyRes = await db.query(`
        SELECT handle,
               name,
               description,
               num_employees AS "numEmployees",
               logo_url      AS "logoUrl"
        FROM companies
        WHERE handle = $1`, [handle]);

    const company = companyRes.rows[0];

    if (!company) throw new NotFoundError(`No company: ${handle}`);

    const jobRes = await db.query(`
        SELECT id,
               title,
               salary,
               equity,
               company_handle AS "companyHandle"
        FROM jobs
        WHERE company_handle = $1
        ORDER BY id DESC`, [handle]);

    company.jobs = jobRes.rows

    return company;
  }

  /** Update company data with `data`.
   *
   * This is a "partial update" --- it's fine if data doesn't contain all the
   * fields; this only changes provided ones.
   *
   * Data can include: {name, description, numEmployees, logoUrl}
   *
   * Returns {handle, name, description, numEmployees, logoUrl}
   *
   * Throws NotFoundError if not found.
   */

  static async update(handle, data) {
    const { setCols, values } = sqlForPartialUpdate(
      data,
      {
        numEmployees: "num_employees",
        logoUrl: "logo_url",
      });
    const handleVarIdx = "$" + (values.length + 1);

    const querySql = `
        UPDATE companies
        SET ${setCols}
        WHERE handle = ${handleVarIdx}
        RETURNING
            handle,
            name,
            description,
            num_employees AS "numEmployees",
            logo_url AS "logoUrl"`;
    const result = await db.query(querySql, [...values, handle]);
    const company = result.rows[0];

    if (!company) throw new NotFoundError(`No company: ${handle}`);

    return company;
  }

  /** Delete given company from database; returns undefined.
   *
   * Throws NotFoundError if company not found.
   **/

  static async remove(handle) {
    const result = await db.query(`
        DELETE
        FROM companies
        WHERE handle = $1
        RETURNING handle`, [handle]);
    const company = result.rows[0];

    if (!company) throw new NotFoundError(`No company: ${handle}`);
  }
}


module.exports = Company;
