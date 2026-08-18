package store

import (
	"database/sql"
	"encoding/json"
	"time"
)

func BulkTemplates(db *sql.DB) ([]BulkTemplate, error) {
	rows, err := db.Query(`SELECT id,name,body FROM krio_bulk_templates ORDER BY name,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []BulkTemplate{}
	for rows.Next() {
		var item BulkTemplate
		if err = rows.Scan(&item.ID, &item.Name, &item.Body); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func SaveBulkTemplate(db *sql.DB, id int64, name, body string) (BulkTemplate, error) {
	if id > 0 {
		result, err := db.Exec(`UPDATE krio_bulk_templates SET name=?,body=? WHERE id=?`, name, body, id)
		if err != nil {
			return BulkTemplate{}, err
		}
		if changed, _ := result.RowsAffected(); changed == 0 {
			return BulkTemplate{}, sql.ErrNoRows
		}
		return BulkTemplate{ID: id, Name: name, Body: body}, nil
	}
	result, err := db.Exec(`INSERT INTO krio_bulk_templates(name,body) VALUES(?,?)`, name, body)
	if err != nil {
		return BulkTemplate{}, err
	}
	id, err = result.LastInsertId()
	return BulkTemplate{ID: id, Name: name, Body: body}, err
}

func DeleteBulkTemplate(db *sql.DB, id int64) error {
	_, err := db.Exec(`DELETE FROM krio_bulk_templates WHERE id=?`, id)
	return err
}

func CreateBulkOperation(db *sql.DB, profileID string, template BulkTemplate, mode string, total int) (int64, error) {
	return CreateOwnedBulkOperation(db, 0, profileID, template, mode, total)
}

func CreateOwnedBulkOperation(db *sql.DB, userID int64, profileID string, template BulkTemplate, mode string, total int) (int64, error) {
	result, err := db.Exec(`INSERT INTO krio_bulk_operations(user_id,profile_id,template_id,template_name,template_body,mode,started_at,status,total) VALUES(?,?,?,?,?,?,?,?,?)`, userID, profileID, template.ID, template.Name, template.Body, mode, time.Now().UnixMilli(), "queued", total)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func StartBulkOperation(db *sql.DB, id int64) error {
	_, err := db.Exec(`UPDATE krio_bulk_operations SET status='running' WHERE id=? AND status='queued'`, id)
	return err
}

func AddBulkOperationItem(db *sql.DB, operationID int64, row int, recipient, message string, values map[string]string, result BulkSendResult) error {
	encoded, _ := json.Marshal(values)
	status := "success"
	if result.Error != "" {
		status = "failed"
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`INSERT INTO krio_bulk_operation_items(operation_id,row_number,recipient,message,values_json,status,error,sent_at) VALUES(?,?,?,?,?,?,?,?)`, operationID, row, recipient, message, string(encoded), status, result.Error, time.Now().UnixMilli()); err != nil {
		return err
	}
	_, err = tx.Exec(`UPDATE krio_bulk_operations SET success=success+?,failed=failed+? WHERE id=?`, BoolInt(status == "success"), BoolInt(status == "failed"), operationID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func FinishBulkOperation(db *sql.DB, id int64, status string, success, failed int) error {
	_, err := db.Exec(`UPDATE krio_bulk_operations SET completed_at=?,status=?,success=?,failed=? WHERE id=?`, time.Now().UnixMilli(), status, success, failed, id)
	return err
}

func BulkOperations(db *sql.DB) ([]BulkOperation, error) {
	return BulkOperationsForUser(db, User{Role: "admin"})
}

func BulkOperationsForUser(db *sql.DB, user User) ([]BulkOperation, error) {
	query := `SELECT id,user_id,profile_id,template_id,template_name,mode,started_at,completed_at,status,total,success,failed FROM krio_bulk_operations`
	var rows *sql.Rows
	var err error
	if user.Role == "admin" {
		rows, err = db.Query(query + ` ORDER BY id DESC`)
	} else {
		rows, err = db.Query(query+` WHERE user_id=? ORDER BY id DESC`, user.ID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []BulkOperation{}
	for rows.Next() {
		var item BulkOperation
		var started int64
		var completed sql.NullInt64
		if err = rows.Scan(&item.ID, &item.UserID, &item.ProfileID, &item.TemplateID, &item.TemplateName, &item.Mode, &started, &completed, &item.Status, &item.Total, &item.Success, &item.Failed); err != nil {
			return nil, err
		}
		item.StartedAt = time.UnixMilli(started)
		if completed.Valid {
			value := time.UnixMilli(completed.Int64)
			item.CompletedAt = &value
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func GetBulkOperation(db *sql.DB, id int64) (BulkOperation, error) {
	return GetBulkOperationForUser(db, id, User{Role: "admin"})
}

func GetBulkOperationForUser(db *sql.DB, id int64, user User) (BulkOperation, error) {
	var item BulkOperation
	var started int64
	var completed sql.NullInt64
	query := `SELECT id,user_id,profile_id,template_id,template_name,template_body,mode,started_at,completed_at,status,total,success,failed FROM krio_bulk_operations WHERE id=?`
	args := []any{id}
	if user.Role != "admin" {
		query += ` AND user_id=?`
		args = append(args, user.ID)
	}
	err := db.QueryRow(query, args...).Scan(&item.ID, &item.UserID, &item.ProfileID, &item.TemplateID, &item.TemplateName, &item.TemplateBody, &item.Mode, &started, &completed, &item.Status, &item.Total, &item.Success, &item.Failed)
	if err != nil {
		return item, err
	}
	item.StartedAt = time.UnixMilli(started)
	if completed.Valid {
		value := time.UnixMilli(completed.Int64)
		item.CompletedAt = &value
	}
	rows, err := db.Query(`SELECT row_number,recipient,message,values_json,status,error,sent_at FROM krio_bulk_operation_items WHERE operation_id=? ORDER BY row_number,id`, id)
	if err != nil {
		return item, err
	}
	defer rows.Close()
	item.Items = []BulkOperationItem{}
	for rows.Next() {
		var detail BulkOperationItem
		var encoded string
		var sent int64
		if err = rows.Scan(&detail.Row, &detail.Recipient, &detail.Message, &encoded, &detail.Status, &detail.Error, &sent); err != nil {
			return item, err
		}
		_ = json.Unmarshal([]byte(encoded), &detail.Values)
		detail.SentAt = time.UnixMilli(sent)
		item.Items = append(item.Items, detail)
	}
	return item, rows.Err()
}
