import type { Request, Response, NextFunction } from 'express';
import type Joi from 'joi';

/**
 * Validate req.body against a Joi schema. On success replaces req.body with
 * the coerced/cleaned value. On failure responds 400 with the first issue.
 */
export function validate<T>(schema: Joi.ObjectSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { value, error } = schema.validate(req.body, { abortEarly: true, stripUnknown: true });
    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }
    req.body = value;
    next();
  };
}
