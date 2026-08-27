interface PrizePercentageEditorProps {
  value: number[]
  onChange: (value: number[]) => void
  title?: string
}

export function PrizePercentageEditor({
  value,
  onChange,
  title,
}: PrizePercentageEditorProps) {
  const total = value.reduce((sum, percentage) => sum + percentage, 0)
  return (
    <div className="prize-percentage-editor">
      {title && <h4>{title}</h4>}
      <div className="percentage-fields">
        {value.map((percentage, index) => (
          <div className="percentage-row" key={`position-${index + 1}`}>
            <label className="field">
              <span>Posición {index + 1}</span>
              <div className="percentage-input">
                <input
                  required
                  min="0"
                  max="100"
                  step="0.1"
                  type="number"
                  value={percentage}
                  onChange={(event) => onChange(value.map((item, itemIndex) =>
                    itemIndex === index ? Number(event.target.value) : item,
                  ))}
                />
                <span>%</span>
              </div>
            </label>
            {value.length > 1 && (
              <button
                className="remove-position-button"
                type="button"
                onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
              >
                Quitar
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="percentage-editor-footer">
        <button className="text-button" type="button" onClick={() => onChange([...value, 0])}>
          + Agregar posición
        </button>
        <span className={Math.abs(total - 100) < 0.001 ? 'percentage-total is-valid' : 'percentage-total'}>
          Total: {total.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
