import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";

interface Point {
  timestamp: string;
  value?: number;
  systolic?: number;
  diastolic?: number;
}

interface TimeSeriesChartProps {
  data: Point[];
  metric: string;
  height?: number;
}

// Client-side date formatting helper
const formatTimestamp = (isoString: string) => {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoString;
  }
};

const CustomTooltip = ({ active, payload, label, metric }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-3 bg-white border border-[#E5E7EB] rounded-xl shadow-lg text-xs font-semibold text-[#111827]">
        <p className="text-[#6B7280] mb-1 font-bold">{formatTimestamp(label)}</p>
        {metric === "blood_pressure" ? (
          <div className="space-y-1">
            <p className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
              Systolic: <span className="font-bold">{payload[0]?.value} mmHg</span>
            </p>
            <p className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#EA580C]" />
              Diastolic: <span className="font-bold">{payload[1]?.value} mmHg</span>
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
            Value: <span className="font-bold">{payload[0]?.value} {getUnit(metric)}</span>
          </p>
        )}
      </div>
    );
  }
  return null;
};

const getUnit = (metric: string) => {
  switch (metric) {
    case "heart_rate": return "bpm";
    case "body_temperature": return "°F";
    case "oxygen": return "%";
    case "weight": return "kg";
    case "bmi": return "";
    default: return "";
  }
};

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ data, metric, height = 260 }) => {
  // Sort data chronologically to ensure proper plotting
  const sortedData = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Define normal ranges for shaded reference areas
  let normalMin: number | undefined;
  let normalMax: number | undefined;
  let diastolicMin: number | undefined;
  let diastolicMax: number | undefined;

  switch (metric) {
    case "heart_rate":
      normalMin = 60;
      normalMax = 100;
      break;
    case "body_temperature":
      normalMin = 97.0;
      normalMax = 99.0;
      break;
    case "oxygen":
      normalMin = 95;
      normalMax = 100;
      break;
    case "bmi":
      normalMin = 18.5;
      normalMax = 24.9;
      break;
    case "blood_pressure":
      normalMin = 90;   // Systolic min
      normalMax = 120;  // Systolic max
      diastolicMin = 60;
      diastolicMax = 80;
      break;
  }

  // Custom out-of-range dot highlighting
  const renderDot = (props: any) => {
    const { cx, cy, value, stroke, index } = props;
    if (cx === undefined || cy === undefined) return null;

    let isOutOfRange = false;
    if (metric === "heart_rate") {
      isOutOfRange = value < 60 || value > 100;
    } else if (metric === "body_temperature") {
      isOutOfRange = value < 97.0 || value > 99.0;
    } else if (metric === "oxygen") {
      isOutOfRange = value < 95 || value > 100;
    } else if (metric === "bmi") {
      isOutOfRange = value < 18.5 || value > 24.9;
    }

    if (isOutOfRange) {
      return (
        <circle key={index} cx={cx} cy={cy} r={5} fill="#EF4444" stroke="#fff" strokeWidth={2} className="shadow-sm" />
      );
    }

    return (
      <circle key={index} cx={cx} cy={cy} r={3.5} fill={stroke} stroke="#fff" strokeWidth={1} />
    );
  };

  const renderBPDot = (type: "systolic" | "diastolic") => (props: any) => {
    const { cx, cy, value, stroke, index } = props;
    if (cx === undefined || cy === undefined) return null;

    let isOutOfRange = false;
    if (type === "systolic") {
      isOutOfRange = value < 90 || value > 120;
    } else {
      isOutOfRange = value < 60 || value > 80;
    }

    if (isOutOfRange) {
      return (
        <circle key={index} cx={cx} cy={cy} r={5} fill="#EF4444" stroke="#fff" strokeWidth={2} className="shadow-sm" />
      );
    }

    return (
      <circle key={index} cx={cx} cy={cy} r={3.5} fill={stroke} stroke="#fff" strokeWidth={1} />
    );
  };

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={sortedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          
          <XAxis 
            dataKey="timestamp" 
            tickFormatter={(ts) => {
              try {
                return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
              } catch {
                return ts;
              }
            }}
            stroke="#94A3B8"
            tick={{ fontSize: 9, fontWeight: 600 }}
            tickLine={false}
          />
          
          <YAxis 
            stroke="#94A3B8"
            tick={{ fontSize: 9, fontWeight: 600 }}
            tickLine={false}
            domain={metric === "oxygen" ? [90, 100] : ["auto", "auto"]}
          />
          
          <Tooltip content={<CustomTooltip metric={metric} />} />

          {/* Clinically normal range shaded bands */}
          {normalMin !== undefined && normalMax !== undefined && metric !== "blood_pressure" && (
            <ReferenceArea 
              y1={normalMin} 
              y2={normalMax} 
              fill="#F0FDF4" 
              fillOpacity={0.5} 
            />
          )}

          {metric === "blood_pressure" && normalMin !== undefined && normalMax !== undefined && (
            <ReferenceArea 
              y1={normalMin} 
              y2={normalMax} 
              fill="#EFF6FF" 
              fillOpacity={0.35} 
            />
          )}

          {metric === "blood_pressure" && diastolicMin !== undefined && diastolicMax !== undefined && (
            <ReferenceArea 
              y1={diastolicMin} 
              y2={diastolicMax} 
              fill="#FFF7ED" 
              fillOpacity={0.35} 
            />
          )}

          {metric === "blood_pressure" ? (
            <>
              {/* Systolic Line */}
              <Line
                type="monotone"
                dataKey="systolic"
                stroke="#2563EB"
                strokeWidth={2}
                dot={renderBPDot("systolic")}
                activeDot={{ r: 6 }}
              />
              {/* Diastolic Line */}
              <Line
                type="monotone"
                dataKey="diastolic"
                stroke="#EA580C"
                strokeWidth={2}
                dot={renderBPDot("diastolic")}
                activeDot={{ r: 6 }}
              />
            </>
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke="#2563EB"
              strokeWidth={2}
              dot={renderDot}
              activeDot={{ r: 6 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
