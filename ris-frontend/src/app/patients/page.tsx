
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Mock data for demonstration purposes
const mockPatients = [
  {
    id: "PAT001",
    name: "John Doe",
    dob: "1985-04-12",
    gender: "Male",
  },
  {
    id: "PAT002",
    name: "Jane Smith",
    dob: "1992-08-21",
    gender: "Female",
  },
  {
    id: "PAT003",
    name: "Michael Johnson",
    dob: "1978-11-30",
    gender: "Male",
  },
  {
    id: "PAT004",
    name: "Emily Davis",
    dob: "2001-02-15",
    gender: "Female",
  },
];

export default function PatientsPage() {
  return (
    <div className="p-4 md:p-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Patients</CardTitle>
              <CardDescription>
                A list of all patients in the system.
              </CardDescription>
            </div>
            <Button>Add New Patient</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockPatients.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell>{patient.id}</TableCell>
                  <TableCell>{patient.name}</TableCell>
                  <TableCell>{patient.dob}</TableCell>
                  <TableCell>{patient.gender}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm">View</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
} 