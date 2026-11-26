const Slider = ({
  label,
  value,
  setValue,
  option,
}: {
  label: string
  value: number
  setValue: (value: number) => void
  option: { min: number; max: number; step: number }
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(Number(event.target.value))
  }

  return (
    <div className="flex items-center">
      <input
        aria-label={label}
        type="range"
        value={value}
        onChange={handleChange}
        className="w-24 bg-red-50 fill-slate-600"
        {...option}
      />
    </div>
  )
}

export default Slider
